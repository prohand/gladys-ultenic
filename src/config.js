// -----------------------------------------------------------------------------
// Integration configuration.
//
// The values are filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches them
// (`gladys.getConfig()`) and notifies every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined` or with a number that
// arrived as a string from the form.
// -----------------------------------------------------------------------------

import { AUTH_MODES } from './ultenic/client.js';

// Bounds of the refresh interval, kept consistent with the `min`/`max` declared
// in the manifest.
export const MIN_REFRESH_INTERVAL = 10;
export const MAX_REFRESH_INTERVAL = 3600;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  region: 'eu', // Tuya data center, see src/ultenic/dataCenters.js
  access_id: '', // Tuya Cloud project Access ID
  access_secret: '', // Tuya Cloud project Access Secret
  // How the Cloud project is authorized over the app account:
  // 'linked_account'   -> the QR code of the Tuya console (Tuya Smart /
  //                       Smart Life only: the Ultenic app has no scanner
  //                       able to read it);
  // 'user_credentials' -> the project logs in as the app user, no QR code.
  auth_mode: AUTH_MODES.LINKED_ACCOUNT,
  user_uid: '', // optional: restrict the discovery to one app account
  // User-credentials mode only.
  app_schema: 'smartlife', // app the account belongs to
  app_username: '', // e-mail (or phone) of the app account
  app_password: '', // password of the app account
  country_code: '', // phone country code, digits only ('33' for France)
  refresh_interval: 30, // seconds between two reads of the vacuum states
};

/**
 * Coerce a value to a number inside [min, max], falling back to `fallback`
 * when it is not a usable number (empty form field, garbage string...).
 * @param {unknown} value the raw value
 * @param {number} fallback the value to use when `value` is unusable
 * @param {number} min lower bound (inclusive)
 * @param {number} max upper bound (inclusive)
 * @returns {number} the clamped number
 */
function toBoundedNumber(value, fallback, min, max) {
  // `Number('')` and `Number(null)` are 0, which would silently become the
  // lower bound: an emptied form field must fall back to the default instead.
  if (value === null || value === undefined || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 * @returns {typeof DEFAULT_CONFIG} the normalized configuration
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    region: String(raw.region ?? DEFAULT_CONFIG.region).trim(),
    // Credentials are copy-pasted: a trailing space is the classic mistake,
    // and it produces an opaque "sign invalid" error on the Tuya side.
    access_id: String(raw.access_id ?? DEFAULT_CONFIG.access_id).trim(),
    access_secret: String(raw.access_secret ?? DEFAULT_CONFIG.access_secret).trim(),
    auth_mode:
      raw.auth_mode === AUTH_MODES.USER_CREDENTIALS
        ? AUTH_MODES.USER_CREDENTIALS
        : AUTH_MODES.LINKED_ACCOUNT,
    user_uid: String(raw.user_uid ?? DEFAULT_CONFIG.user_uid).trim(),
    app_schema: String(raw.app_schema ?? DEFAULT_CONFIG.app_schema).trim(),
    app_username: String(raw.app_username ?? DEFAULT_CONFIG.app_username).trim(),
    // The password is NOT trimmed: a leading or trailing space can be part of
    // it, and silently stripping it would make the login fail for good.
    app_password: String(raw.app_password ?? DEFAULT_CONFIG.app_password),
    // Tuya wants the digits only: "+33", "0033" and "33" all mean 33.
    country_code: String(raw.country_code ?? DEFAULT_CONFIG.country_code)
      .trim()
      .replace(/^\+/, '')
      .replace(/^00/, ''),
    refresh_interval: toBoundedNumber(
      raw.refresh_interval,
      DEFAULT_CONFIG.refresh_interval,
      MIN_REFRESH_INTERVAL,
      MAX_REFRESH_INTERVAL,
    ),
  };
}

/**
 * Is the configuration complete enough to talk to the Tuya cloud? The Cloud
 * project credentials are always required; the user-credentials mode needs the
 * app account on top of them.
 * @param {typeof DEFAULT_CONFIG} config the normalized configuration
 * @returns {boolean} true when everything the chosen mode needs is filled in
 */
export function isConfigured(config) {
  if (config.access_id.length === 0 || config.access_secret.length === 0) {
    return false;
  }
  if (config.auth_mode === AUTH_MODES.USER_CREDENTIALS) {
    return (
      config.app_username.length > 0 &&
      config.app_password.length > 0 &&
      config.app_schema.length > 0
    );
  }
  return true;
}
