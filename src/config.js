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
  user_uid: '', // optional: restrict the discovery to one app account
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
    user_uid: String(raw.user_uid ?? DEFAULT_CONFIG.user_uid).trim(),
    refresh_interval: toBoundedNumber(
      raw.refresh_interval,
      DEFAULT_CONFIG.refresh_interval,
      MIN_REFRESH_INTERVAL,
      MAX_REFRESH_INTERVAL,
    ),
  };
}

/**
 * Is the configuration complete enough to talk to the Tuya cloud?
 * @param {typeof DEFAULT_CONFIG} config the normalized configuration
 * @returns {boolean} true when the mandatory credentials are filled in
 */
export function isConfigured(config) {
  return config.access_id.length > 0 && config.access_secret.length > 0;
}
