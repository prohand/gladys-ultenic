// -----------------------------------------------------------------------------
// Tuya data centers.
//
// A Tuya account lives in exactly ONE data center, chosen when the account is
// created (it follows the country picked in the Ultenic / Smart Life app). The
// Cloud project must be created in that same data center, and every API call
// must go to its endpoint: calling the wrong one authenticates fine but returns
// an empty device list, which is the single most common setup mistake.
//
// Source: Tuya "Request signature" / endpoint reference.
// -----------------------------------------------------------------------------

export const DATA_CENTERS = {
  eu: 'https://openapi.tuyaeu.com', // Central Europe
  we: 'https://openapi-weaz.tuyaeu.com', // Western Europe
  us: 'https://openapi.tuyaus.com', // Western America
  ue: 'https://openapi-ueaz.tuyaus.com', // Eastern America
  in: 'https://openapi.tuyain.com', // India
  cn: 'https://openapi.tuyacn.com', // China
};

export const DEFAULT_DATA_CENTER = 'eu';

/**
 * Resolve the API base URL of a data center.
 * @param {string} region key of the DATA_CENTERS map (manifest `region` value)
 * @returns {string} the https base URL, without a trailing slash
 */
export function getBaseUrl(region) {
  return DATA_CENTERS[region] ?? DATA_CENTERS[DEFAULT_DATA_CENTER];
}
