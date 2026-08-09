import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  buildSignedPath,
  buildStringToSign,
  computeSignature,
  sha256Hex,
} from '../src/ultenic/signature.js';

test('sha256Hex hashes the empty string to the well-known digest', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('buildSignedPath returns the bare path when there is no query', () => {
  assert.equal(buildSignedPath('/v1.0/token'), '/v1.0/token');
});

test('buildSignedPath sorts the query parameters by key', () => {
  // The signature is computed on the sorted form: the request must use the
  // exact same string, so the sort is part of the contract, not cosmetics.
  const path = buildSignedPath('/v1.0/iot-01/associated-users/devices', {
    size: 100,
    last_row_key: 'abc',
  });
  assert.equal(path, '/v1.0/iot-01/associated-users/devices?last_row_key=abc&size=100');
});

test('buildSignedPath drops empty and undefined parameters', () => {
  const path = buildSignedPath('/v1.0/devices', { size: 100, last_row_key: undefined, from: '' });
  assert.equal(path, '/v1.0/devices?size=100');
});

test('buildStringToSign follows the 4-line Tuya layout', () => {
  const stringToSign = buildStringToSign({ method: 'get', signedPath: '/v1.0/token?grant_type=1' });
  assert.deepEqual(stringToSign.split('\n'), [
    'GET',
    sha256Hex(''),
    '',
    '/v1.0/token?grant_type=1',
  ]);
});

test('buildStringToSign hashes the body that is actually sent', () => {
  const body = JSON.stringify({ commands: [{ code: 'power_go', value: true }] });
  const stringToSign = buildStringToSign({ method: 'POST', signedPath: '/v1.0/x', body });
  assert.equal(stringToSign.split('\n')[1], createHash('sha256').update(body).digest('hex'));
});

test('computeSignature omits the access token on the token endpoints', () => {
  const timestamp = '1700000000000';
  const signedPath = '/v1.0/token?grant_type=1';
  const expected = createHmac('sha256', 'secret')
    .update(`id${timestamp}${buildStringToSign({ method: 'GET', signedPath })}`)
    .digest('hex')
    .toUpperCase();

  assert.equal(
    computeSignature({
      accessId: 'id',
      accessSecret: 'secret',
      timestamp,
      method: 'GET',
      signedPath,
    }),
    expected,
  );
});

test('computeSignature includes the access token on business calls', () => {
  const timestamp = '1700000000000';
  const signedPath = '/v1.0/devices/abc/status';
  const expected = createHmac('sha256', 'secret')
    .update(`idtoken${timestamp}${buildStringToSign({ method: 'GET', signedPath })}`)
    .digest('hex')
    .toUpperCase();

  const signature = computeSignature({
    accessId: 'id',
    accessSecret: 'secret',
    timestamp,
    accessToken: 'token',
    method: 'GET',
    signedPath,
  });

  assert.equal(signature, expected);
  // A token-less signature of the same request must differ, otherwise the
  // asymmetry between the two endpoint families would be lost.
  assert.notEqual(
    signature,
    computeSignature({
      accessId: 'id',
      accessSecret: 'secret',
      timestamp,
      method: 'GET',
      signedPath,
    }),
  );
});

test('computeSignature returns uppercase hex', () => {
  const signature = computeSignature({
    accessId: 'id',
    accessSecret: 'secret',
    timestamp: '1',
    method: 'GET',
    signedPath: '/v1.0/token',
  });
  assert.match(signature, /^[0-9A-F]{64}$/);
});
