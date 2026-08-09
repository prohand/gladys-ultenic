// -----------------------------------------------------------------------------
// Device type: ULTENIC ROBOT VACUUM
//
// One instance of this blueprint is created per vacuum found on the Tuya
// cloud. Unlike a hard-coded demo device, the feature list is built from what
// the model actually exposes: the four `vacuum-cleaner` features are always
// there, the sensors (battery, cleaned area, cleaning time, filter life) only
// when the vacuum reports them.
//
// Gladys `vacuum-cleaner` features and what they map to:
//   - state      (read-only)  <- Tuya `status` / `fault`
//   - run-mode   (command)    -> start / stop the cleaning run
//   - clean-mode (command)    <-> Tuya `suction` level
//   - dock       (command)    -> send the vacuum back to its base
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import {
  DOCK_CANDIDATES,
  DP,
  GLADYS_VACUUM_RUN_MODE,
  LOCATE_CANDIDATES,
  START_CANDIDATES,
  STOP_CANDIDATES,
  hasBattery,
  hasDataPoint,
  mapCleanModeFromSuction,
  mapRunModeFromState,
  mapStateFromStatus,
  pickCommand,
  pickSuctionForCleanMode,
  readBatteryLevel,
  scaleValue,
} from '../ultenic/vacuumMapping.js';

const DEVICE_TYPE = 'vacuum';

const logger = createLogger({ name: DEVICE_TYPE });

export const FEATURE = {
  STATE: 'state',
  RUN_MODE: 'run-mode',
  CLEAN_MODE: 'clean-mode',
  DOCK: 'dock',
  BATTERY: 'battery',
  CLEAN_AREA: 'clean-area',
  CLEAN_TIME: 'clean-time',
  FILTER_LIFE: 'filter-life',
};

/**
 * Build the blueprint of one vacuum.
 *
 * @param {object} options the vacuum description
 * @param {object} options.tuyaDevice the raw Tuya device (id, name, online...)
 * @param {object} options.capabilities the parsed device specification
 * @param {Record<string, unknown>} [options.statusMap] the data points known at build time
 * @returns {object} the blueprint used by the device registry
 */
export function createVacuum({ tuyaDevice, capabilities, statusMap = {} }) {
  // The Tuya device id is the stable, unique identifier of the physical
  // machine: it survives a rename in the app and a restart of everything.
  const platformId = tuyaDevice.id;

  return {
    key: DEVICE_TYPE,
    platformId,
    capabilities,
    tuyaDevice,

    /**
     * @param {object} gladys the SDK instance
     * @returns {string} the Gladys external id of this vacuum
     */
    deviceExternalId(gladys) {
      return gladys.externalIds(DEVICE_TYPE, platformId).device;
    },

    /**
     * Build the discovery payload sent to Gladys.
     * @param {object} gladys the SDK instance
     * @returns {object} the device, in the standard Gladys format
     */
    buildDevice(gladys) {
      const ids = gladys.externalIds(DEVICE_TYPE, platformId);
      const features = [
        {
          name: 'Operational state',
          external_id: ids.feature(FEATURE.STATE),
          category: DEVICE_FEATURE_CATEGORIES.VACUUM_CLEANER,
          type: DEVICE_FEATURE_TYPES.VACUUM_CLEANER.STATE,
          read_only: true,
          has_feedback: true,
          keep_history: true,
          min: 0,
          // The core reserves the upper range for values it does not know
          // yet, so the feature accepts the whole byte.
          max: 255,
        },
        {
          name: 'Run mode',
          external_id: ids.feature(FEATURE.RUN_MODE),
          category: DEVICE_FEATURE_CATEGORIES.VACUUM_CLEANER,
          type: DEVICE_FEATURE_TYPES.VACUUM_CLEANER.RUN_MODE,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 2,
        },
        {
          name: 'Return to dock',
          external_id: ids.feature(FEATURE.DOCK),
          category: DEVICE_FEATURE_CATEGORIES.VACUUM_CLEANER,
          type: DEVICE_FEATURE_TYPES.VACUUM_CLEANER.DOCK,
          read_only: false,
          // A button, not a state: the vacuum acknowledges by moving, and
          // the operational state feature is what reports the outcome.
          has_feedback: false,
          keep_history: false,
          min: 0,
          max: 1,
        },
      ];

      if (hasDataPoint(capabilities, statusMap, [DP.SUCTION])) {
        features.push({
          name: 'Clean mode',
          external_id: ids.feature(FEATURE.CLEAN_MODE),
          category: DEVICE_FEATURE_CATEGORIES.VACUUM_CLEANER,
          type: DEVICE_FEATURE_TYPES.VACUUM_CLEANER.CLEAN_MODE,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 6,
        });
      }

      if (hasBattery(capabilities, statusMap)) {
        features.push({
          name: 'Battery',
          external_id: ids.feature(FEATURE.BATTERY),
          category: DEVICE_FEATURE_CATEGORIES.BATTERY,
          type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
          unit: DEVICE_FEATURE_UNITS.PERCENT,
          read_only: true,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 100,
        });
      }

      if (hasDataPoint(capabilities, statusMap, [DP.CLEAN_AREA])) {
        features.push({
          name: 'Cleaned area',
          external_id: ids.feature(FEATURE.CLEAN_AREA),
          category: DEVICE_FEATURE_CATEGORIES.SURFACE,
          type: DEVICE_FEATURE_TYPES.SURFACE.DECIMAL,
          unit: DEVICE_FEATURE_UNITS.SQUARE_METER,
          read_only: true,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 10000,
        });
      }

      if (hasDataPoint(capabilities, statusMap, [DP.CLEAN_TIME])) {
        features.push({
          name: 'Cleaning time',
          external_id: ids.feature(FEATURE.CLEAN_TIME),
          category: DEVICE_FEATURE_CATEGORIES.DURATION,
          type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
          unit: DEVICE_FEATURE_UNITS.MINUTES,
          read_only: true,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 10000,
        });
      }

      if (hasDataPoint(capabilities, statusMap, [DP.FILTER])) {
        features.push({
          name: 'Filter life remaining',
          external_id: ids.feature(FEATURE.FILTER_LIFE),
          category: DEVICE_FEATURE_CATEGORIES.HEPA_FILTER_MONITORING,
          type: DEVICE_FEATURE_TYPES.FILTER_MONITORING.FILTER_LIFE_REMAINING,
          unit: DEVICE_FEATURE_UNITS.PERCENT,
          read_only: true,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 100,
        });
      }

      return {
        name: tuyaDevice.name || `Ultenic ${platformId}`,
        external_id: ids.device,
        // No `poll_frequency`: Gladys would then poll each vacuum separately,
        // while one single cloud call refreshes them all (see the registry).
        features,
      };
    },

    /**
     * Remember the last data points seen: they drive both the states that get
     * published and the feature list of a later re-publication.
     * @param {Record<string, unknown>} newStatusMap the fresh data points
     */
    updateStatusMap(newStatusMap) {
      statusMap = newStatusMap;
    },

    /**
     * Turn the last known Tuya data points into the Gladys states to publish.
     * @param {object} gladys the SDK instance
     * @returns {Array<{ device_feature_external_id: string, state: number }>} the batch of states
     */
    buildStates(gladys) {
      const currentStatus = statusMap;
      const ids = gladys.externalIds(DEVICE_TYPE, platformId);
      const states = [];
      const push = (featureKey, value) => {
        if (value !== null && value !== undefined) {
          states.push({ device_feature_external_id: ids.feature(featureKey), state: value });
        }
      };

      const state = mapStateFromStatus(currentStatus);
      push(FEATURE.STATE, state);
      push(FEATURE.RUN_MODE, mapRunModeFromState(state));
      push(FEATURE.CLEAN_MODE, mapCleanModeFromSuction(currentStatus[DP.SUCTION]));
      push(FEATURE.BATTERY, readBatteryLevel(currentStatus));
      push(
        FEATURE.CLEAN_AREA,
        scaleValue(currentStatus[DP.CLEAN_AREA], capabilities.scales[DP.CLEAN_AREA]),
      );
      push(
        FEATURE.CLEAN_TIME,
        scaleValue(currentStatus[DP.CLEAN_TIME], capabilities.scales[DP.CLEAN_TIME]),
      );
      push(
        FEATURE.FILTER_LIFE,
        scaleValue(currentStatus[DP.FILTER], capabilities.scales[DP.FILTER]),
      );

      return states;
    },

    /**
     * Effective transport of this vacuum. Everything goes through the Tuya
     * cloud, so the only question the badge answers is "is the machine still
     * reachable?" — an Ultenic that has been unplugged for a week shows as
     * unreachable instead of silently keeping its last state.
     * @returns {{ transport: string }} the transport entry
     */
    transport() {
      return {
        transport:
          tuyaDevice.online === false ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.CLOUD,
      };
    },

    /**
     * Make the vacuum beep so the user can find it.
     * @param {import('../ultenic/client.js').UltenicClient} client the Tuya client
     * @returns {Promise<void>} resolves once the command is acknowledged
     */
    async locate(client) {
      const command = pickCommand(capabilities, LOCATE_CANDIDATES);
      if (!command) {
        throw new Error('This vacuum cannot beep on demand.');
      }
      await client.sendCommands(platformId, [command]);
    },

    /**
     * Run a command coming from Gladys.
     * @param {object} gladys the SDK instance
     * @param {object} context the command context
     * @param {object} context.feature the targeted device feature
     * @param {number} context.value the requested value
     * @param {import('../ultenic/client.js').UltenicClient} context.client the Tuya client
     * @returns {Promise<void>} resolves once the command is acknowledged
     */
    async onSetValue(gladys, { feature, value, client }) {
      const ids = gladys.externalIds(DEVICE_TYPE, platformId);

      if (feature.external_id === ids.feature(FEATURE.RUN_MODE)) {
        await setRunMode({ client, capabilities, platformId, value });
        // has_feedback: publish the requested value right away so the UI does
        // not stay stuck; the next refresh publishes what the vacuum reports.
        await gladys.publishState(feature.external_id, value);
        return;
      }

      if (feature.external_id === ids.feature(FEATURE.CLEAN_MODE)) {
        const suction = pickSuctionForCleanMode(value, capabilities);
        if (!suction) {
          throw new Error(`This vacuum does not support the clean mode ${value}.`);
        }
        logger.info(`Clean mode ${value} -> suction "${suction}"`);
        await client.sendCommands(platformId, [{ code: DP.SUCTION, value: suction }]);
        await gladys.publishState(feature.external_id, value);
        return;
      }

      if (feature.external_id === ids.feature(FEATURE.DOCK)) {
        if (value !== 1) {
          // The dock feature is a button: only "go home" means something.
          logger.debug('Dock command with value 0 ignored');
          return;
        }
        const command = pickCommand(capabilities, DOCK_CANDIDATES);
        if (!command) {
          throw new Error('This vacuum cannot be sent back to its dock.');
        }
        logger.info('Sending the vacuum back to its dock');
        await client.sendCommands(platformId, [command]);
        return;
      }

      throw new Error(`Feature ${feature.external_id} is not commandable`);
    },
  };
}

/**
 * Start or stop a cleaning run.
 * @param {object} options the command context
 * @param {import('../ultenic/client.js').UltenicClient} options.client the Tuya client
 * @param {object} options.capabilities the parsed capabilities
 * @param {string} options.platformId the Tuya device id
 * @param {number} options.value the requested GLADYS_VACUUM_RUN_MODE value
 * @returns {Promise<void>} resolves once the command is acknowledged
 */
async function setRunMode({ client, capabilities, platformId, value }) {
  if (value === GLADYS_VACUUM_RUN_MODE.MAPPING) {
    // Tuya exposes no standard "map the house without cleaning" command, and
    // guessing a vendor-specific one would silently do something else.
    throw new Error('Mapping mode is not supported by the Tuya cloud API.');
  }
  const candidates = value === GLADYS_VACUUM_RUN_MODE.CLEANING ? START_CANDIDATES : STOP_CANDIDATES;
  const command = pickCommand(capabilities, candidates);
  if (!command) {
    throw new Error(
      value === GLADYS_VACUUM_RUN_MODE.CLEANING
        ? 'This vacuum exposes no start command.'
        : 'This vacuum exposes no stop command.',
    );
  }
  logger.info(`Run mode ${value} -> ${command.code}=${command.value}`);
  await client.sendCommands(platformId, [command]);
}
