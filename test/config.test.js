import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_REFRESH_INTERVAL,
  MIN_REFRESH_INTERVAL,
  isConfigured,
  normalizeConfig,
} from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps the user values over the defaults', () => {
  const config = normalizeConfig({ region: 'us', access_id: 'abc', access_secret: 'def' });
  assert.equal(config.region, 'us');
  assert.equal(config.access_id, 'abc');
  assert.equal(config.access_secret, 'def');
});

test('normalizeConfig trims the credentials', () => {
  // A trailing space pasted from the Tuya console produces an opaque
  // "sign invalid" error, so it is stripped before it can cause one.
  const config = normalizeConfig({ access_id: '  abc  ', access_secret: '\tdef\n' });
  assert.equal(config.access_id, 'abc');
  assert.equal(config.access_secret, 'def');
});

test('normalizeConfig coerces the refresh interval coming from a form', () => {
  const config = normalizeConfig({ refresh_interval: '90' });
  assert.equal(config.refresh_interval, 90);
  assert.equal(typeof config.refresh_interval, 'number');
});

test('normalizeConfig clamps the refresh interval to the manifest bounds', () => {
  assert.equal(normalizeConfig({ refresh_interval: 1 }).refresh_interval, MIN_REFRESH_INTERVAL);
  assert.equal(normalizeConfig({ refresh_interval: 99999 }).refresh_interval, MAX_REFRESH_INTERVAL);
});

test('normalizeConfig falls back to the default for an unusable refresh interval', () => {
  assert.equal(
    normalizeConfig({ refresh_interval: '' }).refresh_interval,
    DEFAULT_CONFIG.refresh_interval,
  );
  assert.equal(
    normalizeConfig({ refresh_interval: 'soon' }).refresh_interval,
    DEFAULT_CONFIG.refresh_interval,
  );
});

test('isConfigured requires both halves of the Tuya credentials', () => {
  assert.equal(isConfigured(normalizeConfig()), false);
  assert.equal(isConfigured(normalizeConfig({ access_id: 'abc' })), false);
  assert.equal(isConfigured(normalizeConfig({ access_secret: 'def' })), false);
  assert.equal(isConfigured(normalizeConfig({ access_id: 'abc', access_secret: 'def' })), true);
});

test('the app account mode also requires the app account', () => {
  const base = { access_id: 'abc', access_secret: 'def', auth_mode: 'user_credentials' };
  assert.equal(isConfigured(normalizeConfig(base)), false);
  assert.equal(isConfigured(normalizeConfig({ ...base, app_username: 'me@example.com' })), false);
  assert.equal(
    isConfigured(normalizeConfig({ ...base, app_username: 'me@example.com', app_password: 'x' })),
    true,
    'app_schema defaults to smartlife, so the account alone is enough',
  );
  assert.equal(
    isConfigured(
      normalizeConfig({
        ...base,
        app_username: 'me@example.com',
        app_password: 'x',
        app_schema: '',
      }),
    ),
    false,
  );
});

test('an unknown auth mode falls back to the linked account', () => {
  // The mode drives which token endpoint is called: an unexpected value must
  // not end up being passed through to Tuya.
  assert.equal(normalizeConfig({ auth_mode: 'something_else' }).auth_mode, 'linked_account');
  assert.equal(normalizeConfig().auth_mode, 'linked_account');
  assert.equal(normalizeConfig({ auth_mode: 'user_credentials' }).auth_mode, 'user_credentials');
});

test('the country code is reduced to its digits', () => {
  assert.equal(normalizeConfig({ country_code: '+33' }).country_code, '33');
  assert.equal(normalizeConfig({ country_code: '0033' }).country_code, '33');
  assert.equal(normalizeConfig({ country_code: ' 44 ' }).country_code, '44');
});

test('the app password keeps its surrounding spaces', () => {
  // Trimming a password that legitimately starts or ends with a space would
  // make the login fail forever, with nothing on screen to explain it.
  assert.equal(normalizeConfig({ app_password: ' hunter2 ' }).app_password, ' hunter2 ');
});
