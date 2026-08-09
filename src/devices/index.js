// -----------------------------------------------------------------------------
// Device registry.
//
// Unlike a template with a fixed catalog, the devices of this integration are
// discovered at runtime: whatever robot vacuum the Tuya cloud reports for the
// linked Ultenic account becomes a Gladys device. The registry owns that
// catalog and the refresh loop that keeps it up to date.
//
// Refresh strategy — the reason there is no `poll_frequency` on the devices:
// the Tuya listing endpoint returns EVERY device with its current data points,
// so ONE call refreshes the whole fleet. Letting Gladys poll each vacuum
// separately would multiply the cloud calls by the number of vacuums for no
// benefit, so the registry runs its own timer instead.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { UltenicClient } from '../ultenic/client.js';
import { parseCapabilities, toStatusMap, unknownCapabilities } from '../ultenic/vacuumMapping.js';
import { createVacuum } from './vacuum.js';

const logger = createLogger({ name: 'registry' });

// The host API accepts 100 states per request (and 300 per minute); the
// registry only publishes what changed, so this is a safety net, not a
// regular occurrence.
const MAX_STATES_PER_REQUEST = 100;

// After a command, the vacuum needs a moment to actually move before its data
// points reflect the new situation. Re-reading right away would publish the
// old state over the optimistic one.
const POST_COMMAND_REFRESH_DELAY_MS = 4000;

/**
 * Split an array into chunks of at most `size` elements.
 * @param {Array} items the items to split
 * @param {number} size the maximum chunk size
 * @returns {Array<Array>} the chunks
 */
function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export class DeviceRegistry {
  /**
   * @param {object} gladys the SDK instance
   */
  constructor(gladys) {
    this.gladys = gladys;
    this.client = null;
    this.config = null;
    /** @type {Map<string, object>} vacuums, keyed by Gladys device external_id */
    this.vacuums = new Map();
    /** @type {Map<string, number>} last published state, keyed by feature external_id */
    this.lastPublishedStates = new Map();
    /** @type {Map<string, string>} last published transport, keyed by device external_id */
    this.lastPublishedTransports = new Map();
    this.refreshTimer = null;
    /** @type {Map<string, NodeJS.Timeout>} pending post-command reads, per device */
    this.postCommandTimers = new Map();
  }

  /**
   * Apply a (possibly new) configuration. The Tuya client is rebuilt whenever
   * a credential changes, so the next call authenticates with the new ones.
   * @param {object} config the normalized configuration
   */
  setConfig(config) {
    // Every key the Tuya client is built from: a change on any of them means
    // the next call must authenticate again, possibly as somebody else.
    const CLIENT_KEYS = [
      'region',
      'access_id',
      'access_secret',
      'auth_mode',
      'user_uid',
      'app_schema',
      'app_username',
      'app_password',
      'country_code',
    ];
    const credentialsChanged =
      !this.config || CLIENT_KEYS.some((key) => this.config[key] !== config[key]);

    this.config = config;

    if (credentialsChanged) {
      this.client = new UltenicClient({
        region: config.region,
        accessId: config.access_id,
        accessSecret: config.access_secret,
        authMode: config.auth_mode,
        userUid: config.user_uid,
        appSchema: config.app_schema,
        appUsername: config.app_username,
        appPassword: config.app_password,
        countryCode: config.country_code,
      });
      // The catalog belongs to the old account: drop it rather than mixing.
      this.vacuums.clear();
      this.lastPublishedStates.clear();
      this.lastPublishedTransports.clear();
    }
  }

  /**
   * @returns {import('../ultenic/client.js').UltenicClient} the Tuya client
   */
  requireClient() {
    if (!this.client) {
      throw new Error('The integration is not configured yet.');
    }
    return this.client;
  }

  /**
   * Read the vacuums from the Tuya cloud and rebuild the catalog. The device
   * specification is read once per vacuum (it never changes for a given
   * model) and reused for the lifetime of the entry.
   * @returns {Promise<Array<object>>} the blueprints of the discovered vacuums
   */
  async discover() {
    const client = this.requireClient();
    const tuyaVacuums = await client.listVacuums();
    logger.info(`${tuyaVacuums.length} Ultenic vacuum(s) found on the Tuya cloud`);

    const previous = new Map(this.vacuums);
    this.vacuums.clear();

    for (const tuyaDevice of tuyaVacuums) {
      const statusMap = toStatusMap(tuyaDevice.status);
      const externalId = this.gladys.externalIds('vacuum', tuyaDevice.id).device;
      const known = previous.get(externalId);

      let capabilities = known?.capabilities;
      if (!capabilities) {
        try {
          capabilities = parseCapabilities(await client.getSpecification(tuyaDevice.id));
        } catch (err) {
          // Some Cloud projects do not have the "Device Status Notification"
          // API subscribed. Losing the specification only costs us the exact
          // list of supported values, not the ability to drive the vacuum.
          logger.warn(`Specification unavailable for ${tuyaDevice.id}: ${err.message}`);
          capabilities = unknownCapabilities();
        }
      }

      this.vacuums.set(externalId, createVacuum({ tuyaDevice, capabilities, statusMap }));
    }

    return [...this.vacuums.values()];
  }

  /**
   * @returns {Array<object>} the discovery payload of every known vacuum
   */
  buildDiscoveredDevices() {
    return [...this.vacuums.values()].map((vacuum) => vacuum.buildDevice(this.gladys));
  }

  /**
   * Find the vacuum that owns a Gladys device external_id.
   * @param {string} externalId the Gladys device external_id
   * @returns {object|undefined} the blueprint, or undefined
   */
  findByExternalId(externalId) {
    return this.vacuums.get(externalId);
  }

  /**
   * Publish the catalog to Gladys, then its states and transports.
   * @returns {Promise<void>} resolves once everything is published
   */
  async publishCatalog() {
    await this.gladys.publishDiscoveredDevices(this.buildDiscoveredDevices());
    // A fresh catalog invalidates the "already published" memory: the newly
    // created devices must receive their first state.
    this.lastPublishedStates.clear();
    this.lastPublishedTransports.clear();
    await this.publishStates();
    await this.publishTransports();
  }

  /**
   * Publish the states that CHANGED since the last publication. The host API
   * rate limit is sized for state changes, and a vacuum sitting on its dock
   * would otherwise republish the same seven values every refresh.
   * @returns {Promise<void>} resolves once the states are published
   */
  async publishStates() {
    const states = [];
    for (const vacuum of this.vacuums.values()) {
      for (const state of vacuum.buildStates(this.gladys)) {
        if (this.lastPublishedStates.get(state.device_feature_external_id) !== state.state) {
          states.push(state);
        }
      }
    }
    if (states.length === 0) {
      return;
    }
    for (const batch of chunk(states, MAX_STATES_PER_REQUEST)) {
      await this.gladys.publishStates(batch);
    }
    for (const state of states) {
      this.lastPublishedStates.set(state.device_feature_external_id, state.state);
    }
    logger.debug(`${states.length} state(s) published`);
  }

  /**
   * Publish the cloud/unreachable badge of the vacuums whose reachability
   * changed.
   * @returns {Promise<void>} resolves once the transports are published
   */
  async publishTransports() {
    const entries = [];
    for (const [externalId, vacuum] of this.vacuums) {
      const { transport } = vacuum.transport();
      if (this.lastPublishedTransports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    await this.gladys.publishTransports(entries);
    for (const entry of entries) {
      this.lastPublishedTransports.set(entry.external_id, entry.transport);
    }
  }

  /**
   * Re-read every vacuum in ONE cloud call and publish what changed.
   * @returns {Promise<void>} resolves once the refresh is done
   */
  async refreshAll() {
    const client = this.requireClient();
    const tuyaVacuums = await client.listVacuums();

    let seen = 0;
    let newVacuumSeen = false;
    for (const tuyaDevice of tuyaVacuums) {
      const externalId = this.gladys.externalIds('vacuum', tuyaDevice.id).device;
      const vacuum = this.vacuums.get(externalId);
      if (!vacuum) {
        newVacuumSeen = true;
        continue;
      }
      seen += 1;
      vacuum.tuyaDevice.online = tuyaDevice.online;
      vacuum.updateStatusMap(toStatusMap(tuyaDevice.status));
    }

    // A vacuum appeared in the Ultenic app, or one was removed from it: pick
    // the change up so the Discovery screen stays truthful without a restart.
    if (newVacuumSeen || seen !== this.vacuums.size) {
      logger.info('The vacuum list changed on the account, rebuilding the catalog');
      await this.discover();
      await this.publishCatalog();
      return;
    }

    await this.publishStates();
    await this.publishTransports();
  }

  /**
   * Re-read ONE vacuum. Used right after a command, and by `onPoll` when the
   * user configured a poll frequency on the device in Gladys.
   * @param {object} vacuum the blueprint to refresh
   * @returns {Promise<void>} resolves once the states are published
   */
  async refreshOne(vacuum) {
    const client = this.requireClient();
    vacuum.updateStatusMap(toStatusMap(await client.getStatus(vacuum.platformId)));
    await this.publishStates();
  }

  /**
   * Schedule a single-device refresh shortly after a command, so the UI
   * settles on what the vacuum really did instead of on what we asked.
   * @param {object} vacuum the blueprint to refresh
   */
  scheduleRefreshAfterCommand(vacuum) {
    // One timer PER vacuum: two commands sent to two machines in the same
    // second must both get their follow-up read.
    const externalId = vacuum.deviceExternalId(this.gladys);
    clearTimeout(this.postCommandTimers.get(externalId));
    const timer = setTimeout(() => {
      this.postCommandTimers.delete(externalId);
      this.refreshOne(vacuum).catch((err) =>
        logger.warn(`Post-command refresh failed: ${err.message}`),
      );
    }, POST_COMMAND_REFRESH_DELAY_MS);
    // Do not hold the event loop open just for a refresh.
    timer.unref?.();
    this.postCommandTimers.set(externalId, timer);
  }

  /**
   * (Re)start the refresh loop with the configured interval.
   * @param {(error: Error|null) => void} onRefreshResult called after each cycle
   */
  startRefreshLoop(onRefreshResult) {
    this.stopRefreshLoop();
    const intervalMs = this.config.refresh_interval * 1000;
    logger.info(`Refreshing the vacuums every ${this.config.refresh_interval}s`);
    this.refreshTimer = setInterval(() => {
      this.refreshAll().then(
        () => onRefreshResult(null),
        (err) => {
          logger.error(`Refresh failed: ${err.message}`);
          onRefreshResult(err);
        },
      );
    }, intervalMs);
  }

  /**
   * Stop the refresh loop and any pending post-command refresh.
   */
  stopRefreshLoop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const timer of this.postCommandTimers.values()) {
      clearTimeout(timer);
    }
    this.postCommandTimers.clear();
  }
}
