// -----------------------------------------------------------------------------
// Tuya OpenAPI request signature (HMAC-SHA256).
//
// Every call to the Tuya cloud carries a signature computed from the request
// itself. Getting one byte wrong returns a generic "sign invalid" (code 1004),
// so the algorithm is isolated here: pure functions, no I/O, unit tested.
//
// Algorithm (Tuya "Signature algorithm", version 2):
//
//   stringToSign = HTTPMethod        \n
//                  SHA256(body)      \n   (hex, lowercase; SHA256("") if no body)
//                  signHeaders       \n   (empty: we sign no extra header)
//                  path?sortedQuery
//
//   signStr = client_id [+ access_token] + t + nonce + stringToSign
//   sign    = HMAC-SHA256(signStr, client_secret) as UPPERCASE hex
//
// The access token is part of `signStr` for every business call, and ABSENT
// from the two token endpoints (`GET /v1.0/token` and `GET /v1.0/token/{rt}`)
// — that asymmetry is the whole subtlety of the scheme.
//
// `nonce` is optional; we send none, so it is the empty string on both sides.
// -----------------------------------------------------------------------------

import { createHash, createHmac } from 'node:crypto';

const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex');

/**
 * Lowercase hex SHA-256 of a string.
 * @param {string} content the content to hash
 * @returns {string} the hex digest
 */
export function sha256Hex(content) {
  if (content === '') {
    return EMPTY_BODY_HASH;
  }
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Build the path + query string that is BOTH signed and requested. The query
 * parameters are sorted by key: the signature is computed on the sorted form,
 * so the request has to use it too.
 * @param {string} path the API path, e.g. '/v1.0/token'
 * @param {Record<string, string|number|undefined>} query the query parameters
 * @returns {string} the path, with its sorted query string when there is one
 */
export function buildSignedPath(path, query = {}) {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)])
    .sort(([left], [right]) => (left < right ? -1 : 1));
  if (entries.length === 0) {
    return path;
  }
  const queryString = entries.map(([key, value]) => `${key}=${value}`).join('&');
  return `${path}?${queryString}`;
}

/**
 * Build the string the signature is computed on.
 * @param {object} options the request description
 * @param {string} options.method HTTP method, uppercase
 * @param {string} options.signedPath path + sorted query, from buildSignedPath
 * @param {string} options.body the exact body string sent ('' when there is none)
 * @returns {string} the string to sign
 */
export function buildStringToSign({ method, signedPath, body = '' }) {
  // Third line = the signed headers; we declare none, so it stays empty.
  return [method.toUpperCase(), sha256Hex(body), '', signedPath].join('\n');
}

/**
 * Compute the `sign` header of a Tuya request.
 * @param {object} options the request description
 * @param {string} options.accessId the Tuya Cloud project Access ID
 * @param {string} options.accessSecret the Tuya Cloud project Access Secret
 * @param {string} options.timestamp the `t` header, milliseconds as a string
 * @param {string} [options.accessToken] the access token, omitted on the token endpoints
 * @param {string} [options.nonce] the optional nonce, empty when not sent
 * @param {string} options.method HTTP method
 * @param {string} options.signedPath path + sorted query, from buildSignedPath
 * @param {string} [options.body] the exact body string sent
 * @returns {string} the uppercase hex signature
 */
export function computeSignature({
  accessId,
  accessSecret,
  timestamp,
  accessToken = '',
  nonce = '',
  method,
  signedPath,
  body = '',
}) {
  const stringToSign = buildStringToSign({ method, signedPath, body });
  const signStr = `${accessId}${accessToken}${timestamp}${nonce}${stringToSign}`;
  return createHmac('sha256', accessSecret).update(signStr, 'utf8').digest('hex').toUpperCase();
}
