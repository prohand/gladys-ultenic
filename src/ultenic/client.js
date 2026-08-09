// -----------------------------------------------------------------------------
// The "driver" of this integration: a small Tuya OpenAPI client.
//
// Ultenic robot vacuums are built on the Tuya platform (the Ultenic app is a
// branded Tuya app), so the way to reach them from a program is the Tuya IoT
// cloud: the user creates a free Cloud project and gives us its Access ID /
// Access Secret.
//
// TWO ways to tell the project WHICH app account it may see, because the first
// one does not work for everybody:
//   - LINKED ACCOUNT (default): the user scans the "Link App Account" QR code
//     of the Tuya console with their app. Simple, but the QR scanner is only
//     implemented by Tuya Smart / Smart Life and by allowlisted branded apps —
//     the Ultenic app has no such scanner (the one in its group management
//     screen only reads home invitations and silently rejects this QR).
//   - USER CREDENTIALS: the project authenticates AS the app user, with their
//     e-mail, password, country code and app schema. No QR code involved.
//     This is the escape hatch when the QR path is unavailable or keeps
//     expiring.
// Both end up with the same access token, and everything downstream is
// identical.
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

import { createHash } from 'node:crypto';
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

// The two ways of authorizing the Cloud project over an app account.
export const AUTH_MODES = {
  LINKED_ACCOUNT: 'linked_account',
  USER_CREDENTIALS: 'user_credentials',
};

// Token endpoints. Both are signed WITHOUT an access token.
const TOKEN_PATH = '/v1.0/token';
const USER_LOGIN_PATH = '/v1.0/iot-01/associated-users/actions/authorized-login';

/**
 * Hash a password the way the Tuya user-login endpoint expects it (MD5, lower
 * case hex). Weak by modern standards, but it is the wire format Tuya defines
 * for this endpoint: the plain password never leaves this process either way.
 * @param {string} password the plain password
 * @returns {string} the lowercase md5 hex digest
 */
function hashPassword(password) {
  return createHash('md5').update(password, 'utf8').digest('hex');
}

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
   * @param {string} [options.authMode] one of AUTH_MODES
   * @param {string} [options.appSchema] app schema, user-credentials mode only
   * @param {string} [options.appUsername] app account e-mail, user-credentials mode only
   * @param {string} [options.appPassword] app account password, user-credentials mode only
   * @param {string} [options.countryCode] phone country code (e.g. '33'), user-credentials mode only
   */
  constructor({
    region,
    accessId,
    accessSecret,
    userUid = '',
    authMode = AUTH_MODES.LINKED_ACCOUNT,
    appSchema = '',
    appUsername = '',
    appPassword = '',
    countryCode = '',
  }) {
    this.baseUrl = getBaseUrl(region);
    this.accessId = accessId;
    this.accessSecret = accessSecret;
    this.userUid = userUid;
    this.authMode = authMode;
    this.appSchema = appSchema;
    this.appUsername = appUsername;
    this.appPassword = appPassword;
    this.countryCode = countryCode;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
    // UID that came back with the token: in user-credentials mode it IS the
    // app account, so it is the right thing to list the devices of.
    this.tokenUid = '';
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
   * @returns {boolean} true when the project authenticates as the app user
   */
  usesUserCredentials() {
    return this.authMode === AUTH_MODES.USER_CREDENTIALS;
  }

  /**
   * Fetch a brand new token pair, by whichever route the user configured.
   * @returns {Promise<void>} resolves once the token is cached
   */
  async fetchToken() {
    const result = this.usesUserCredentials()
      ? await this.loginAsAppUser()
      : // "Simple mode" (grant_type=1): the project credentials themselves are
        // the grant, and the devices come from the accounts linked by QR code.
        await this.rawRequest({
          method: 'GET',
          path: TOKEN_PATH,
          query: { grant_type: 1 },
          authenticated: false,
        });
    this.storeToken(result);
    logger.info(
      `Tuya access token obtained (${this.usesUserCredentials() ? 'user credentials' : 'linked account'})`,
    );
  }

  /**
   * Authenticate as the app user: the QR-free route. The account must exist in
   * the app whose `schema` is passed, in the data center of the project.
   * @returns {Promise<object>} the Tuya token payload
   */
  async loginAsAppUser() {
    if (!this.appUsername || !this.appPassword || !this.appSchema) {
      throw new TuyaApiError('Missing app account, password or app schema.');
    }
    return this.rawRequest({
      method: 'POST',
      path: USER_LOGIN_PATH,
      body: {
        username: this.appUsername,
        password: hashPassword(this.appPassword),
        country_code: this.countryCode,
        schema: this.appSchema,
      },
      authenticated: false,
    });
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
    // In user-credentials mode this UID IS the app account we logged in as:
    // it is what the per-user device listing needs.
    this.tokenUid = result.uid ?? '';
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
    this.tokenUid = '';
  }

  /**
   * List every device of the app account(s) the project can see, with its
   * current status.
   *
   * Two endpoints, same payload shape:
   *   - per user, when we know which account to ask for. That is the case
   *     whenever the user filled in a UID, and ALWAYS in user-credentials
   *     mode, where the token itself belongs to one app account;
   *   - across every account linked to the Cloud project otherwise — the
   *     linked-account user who never wrote their UID down.
   * @returns {Promise<Array<object>>} the raw Tuya devices
   */
  async listDevices() {
    await this.ensureToken();
    const uid = this.userUid || (this.usesUserCredentials() ? this.tokenUid : '');

    if (uid) {
      const result = await this.request({
        method: 'GET',
        path: `/v1.0/users/${uid}/devices`,
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
