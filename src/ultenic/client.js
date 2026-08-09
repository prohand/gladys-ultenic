// -----------------------------------------------------------------------------
// The "driver" of this integration: a small Tuya OpenAPI client.
//
// Ultenic robot vacuums are built on the Tuya platform (the Ultenic app is a
// branded Tuya app), so the way to reach them from a program is the Tuya IoT
// cloud: the user creates a free Cloud project, links their Ultenic app
// account to it, and gives us the project Access ID / Access Secret.
//
// This module owns everything protocol-related:
//   - the access token lifecycle (fetch, cache, refresh, retry once);
//   - the signed HTTP calls (see signature.js);
//   - the four endpoints the integration needs (list, status, specification,
//     commands).
// It knows nothing about Gladys: it returns raw Tuya payloads.
//
// Node 20+ provides `fetch` natively: no HTTP dependency needed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { getBaseUrl } from './dataCenters.js';
import { buildSignedPath, computeSignature } from './signature.js';

const logger = createLogger({ name: 'tuya-client' });

// Tuya answers HTTP 200 with `success: false` and one of these codes when the
// access token is no longer usable. They are the only ones worth a retry.
const TOKEN_ERROR_CODES = new Set([1010, 1011, 1012]);

// Refresh the token slightly before it actually expires, so a call started
// just under the wire does not race the expiry.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

const REQUEST_TIMEOUT_MS = 15_000;

// Tuya category of the "robot vacuum" product type (sweeping robot).
export const VACUUM_CATEGORY = 'sd';

// Max page size accepted by the device listing endpoints.
const PAGE_SIZE = 100;

/**
 * Error carrying the Tuya business code, so callers can tell an expired token
 * from a wrong data center from a device that is simply offline.
 */
export class TuyaApiError extends Error {
  /**
   * @param {string} message human readable message
   * @param {number|null} code the Tuya business code, when there is one
   */
  constructor(message, code = null) {
    super(message);
    this.name = 'TuyaApiError';
    this.code = code;
  }
}

export class UltenicClient {
  /**
   * @param {object} options the client options
   * @param {string} options.region data center key ('eu', 'us'...)
   * @param {string} options.accessId Tuya Cloud project Access ID
   * @param {string} options.accessSecret Tuya Cloud project Access Secret
   * @param {string} [options.userUid] optional app account UID to restrict the discovery
   */
  constructor({ region, accessId, accessSecret, userUid = '' }) {
    this.baseUrl = getBaseUrl(region);
    this.accessId = accessId;
    this.accessSecret = accessSecret;
    this.userUid = userUid;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Send a signed request and unwrap the Tuya envelope.
   * @param {object} options the request description
   * @param {string} options.method HTTP method
   * @param {string} options.path API path
   * @param {Record<string, string|number|undefined>} [options.query] query parameters
   * @param {object|null} [options.body] JSON body, or null for no body
   * @param {boolean} [options.authenticated] false on the token endpoints
   * @returns {Promise<unknown>} the `result` field of the Tuya response
   */
  async rawRequest({ method, path, query = {}, body = null, authenticated = true }) {
    const signedPath = buildSignedPath(path, query);
    // The body is stringified ONCE: the exact same bytes are hashed for the
    // signature and sent on the wire, otherwise the signature never matches.
    const bodyString = body === null ? '' : JSON.stringify(body);
    const timestamp = Date.now().toString();
    const accessToken = authenticated ? (this.accessToken ?? '') : '';

    const headers = {
      client_id: this.accessId,
      sign_method: 'HMAC-SHA256',
      t: timestamp,
      sign: computeSignature({
        accessId: this.accessId,
        accessSecret: this.accessSecret,
        timestamp,
        accessToken,
        method,
        signedPath,
        body: bodyString,
      }),
    };
    if (authenticated) {
      headers.access_token = accessToken;
    }
    if (bodyString !== '') {
      headers['Content-Type'] = 'application/json';
    }

    logger.debug(`${method} ${signedPath}`);

    const response = await fetch(`${this.baseUrl}${signedPath}`, {
      method,
      headers,
      body: bodyString === '' ? undefined : bodyString,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new TuyaApiError(`Tuya HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.success !== true) {
      throw new TuyaApiError(
        `Tuya API error ${payload.code}: ${payload.msg ?? 'unknown error'}`,
        payload.code ?? null,
      );
    }
    return payload.result;
  }

  /**
   * Fetch a brand new token pair (grant_type=1, "simple mode": the project
   * credentials themselves are the grant, no user interaction).
   * @returns {Promise<void>} resolves once the token is cached
   */
  async fetchToken() {
    const result = await this.rawRequest({
      method: 'GET',
      path: '/v1.0/token',
      query: { grant_type: 1 },
      authenticated: false,
    });
    this.storeToken(result);
    logger.info('Tuya access token obtained');
  }

  /**
   * Exchange the refresh token for a new token pair. Falls back to a full
   * fetch when the refresh token itself is dead.
   * @returns {Promise<void>} resolves once the token is cached
   */
  async renewToken() {
    if (!this.refreshToken) {
      await this.fetchToken();
      return;
    }
    try {
      const result = await this.rawRequest({
        method: 'GET',
        path: `/v1.0/token/${this.refreshToken}`,
        authenticated: false,
      });
      this.storeToken(result);
      logger.info('Tuya access token refreshed');
    } catch (err) {
      logger.warn(`Token refresh failed (${err.message}), asking for a new one`);
      await this.fetchToken();
    }
  }

  /**
   * Cache a token pair returned by one of the token endpoints.
   * @param {{ access_token: string, refresh_token: string, expire_time: number, uid?: string }} result the Tuya payload
   */
  storeToken(result) {
    this.accessToken = result.access_token;
    this.refreshToken = result.refresh_token;
    // `expire_time` is a duration in seconds (typically 7200), not a date.
    this.tokenExpiresAt = Date.now() + Number(result.expire_time ?? 0) * 1000;
    if (result.uid && !this.userUid) {
      // Handy for the logs: the UID of the app account behind the project.
      this.projectUid = result.uid;
    }
  }

  /**
   * Make sure a usable token is cached before a business call.
   * @returns {Promise<void>} resolves once a token is available
   */
  async ensureToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
      return;
    }
    if (this.accessToken) {
      await this.renewToken();
      return;
    }
    await this.fetchToken();
  }

  /**
   * Authenticated call: obtains a token when needed, and retries ONCE after a
   * refresh if the cloud rejects the token anyway (clock skew, token revoked
   * on the Tuya side...).
   * @param {object} options same shape as rawRequest, minus `authenticated`
   * @returns {Promise<unknown>} the `result` field of the Tuya response
   */
  async request(options) {
    await this.ensureToken();
    try {
      return await this.rawRequest({ ...options, authenticated: true });
    } catch (err) {
      if (!(err instanceof TuyaApiError) || !TOKEN_ERROR_CODES.has(err.code)) {
        throw err;
      }
      logger.warn(`Token rejected (code ${err.code}), renewing and retrying once`);
      await this.renewToken();
      return this.rawRequest({ ...options, authenticated: true });
    }
  }

  /**
   * Forget the cached token: used when the credentials change, so the next
   * call authenticates with the new ones.
   */
  resetToken() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * List every device of the linked app account(s), with its current status.
   *
   * Two endpoints, same shape: with a UID we ask for that one account, without
   * we ask for every account linked to the Cloud project — the case of a user
   * who linked their Ultenic account and never wrote the UID down.
   * @returns {Promise<Array<object>>} the raw Tuya devices
   */
  async listDevices() {
    if (this.userUid) {
      const result = await this.request({
        method: 'GET',
        path: `/v1.0/users/${this.userUid}/devices`,
      });
      return Array.isArray(result) ? result : [];
    }

    const devices = [];
    let lastRowKey;
    // Paginated cursor listing: `has_more` + `last_row_key`, 100 per page.
    // Bounded by the page count so a misbehaving cursor cannot loop forever.
    for (let page = 0; page < 20; page += 1) {
      const result = await this.request({
        method: 'GET',
        path: '/v1.0/iot-01/associated-users/devices',
        query: { size: PAGE_SIZE, last_row_key: lastRowKey },
      });
      devices.push(...(result?.devices ?? []));
      if (!result?.has_more) {
        break;
      }
      lastRowKey = result.last_row_key;
    }
    return devices;
  }

  /**
   * List the robot vacuums only (Tuya category `sd`).
   * @returns {Promise<Array<object>>} the raw Tuya vacuum devices
   */
  async listVacuums() {
    const devices = await this.listDevices();
    return devices.filter((device) => device.category === VACUUM_CATEGORY);
  }

  /**
   * Read the current data points of one device.
   * @param {string} deviceId the Tuya device id
   * @returns {Promise<Array<{ code: string, value: unknown }>>} the status list
   */
  async getStatus(deviceId) {
    const result = await this.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/status`,
    });
    return Array.isArray(result) ? result : [];
  }

  /**
   * Read the specification of a device: which data points exist, their type
   * and their allowed values. This is what lets the integration expose only
   * the features a given vacuum really supports, instead of a fixed guess.
   * @param {string} deviceId the Tuya device id
   * @returns {Promise<{ functions: Array<object>, status: Array<object> }>} the specification
   */
  async getSpecification(deviceId) {
    const result = await this.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/specifications`,
    });
    return {
      functions: result?.functions ?? [],
      status: result?.status ?? [],
    };
  }

  /**
   * Send commands (data point writes) to a device.
   * @param {string} deviceId the Tuya device id
   * @param {Array<{ code: string, value: unknown }>} commands the data points to write
   * @returns {Promise<unknown>} the Tuya result
   */
  async sendCommands(deviceId, commands) {
    logger.info(`Command -> ${deviceId}: ${JSON.stringify(commands)}`);
    return this.request({
      method: 'POST',
      path: `/v1.0/devices/${deviceId}/commands`,
      body: { commands },
    });
  }
}
