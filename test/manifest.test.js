// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest structure is validated by the store indexer, but nothing there
// can know which handlers the code registers, nor which data center keys the
// integration actually knows — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { DATA_CENTERS } from '../src/ultenic/dataCenters.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Action keys registered in index.js.
const REGISTERED_ACTIONS = ['test_connection', 'refresh_devices', 'locate'];

test('every manifest action has a registered handler', () => {
  for (const action of manifest.actions ?? []) {
    assert.ok(
      REGISTERED_ACTIONS.includes(action.key),
      `manifest action "${action.key}" has no handler`,
    );
  }
});

test('every registered handler is declared in the manifest', () => {
  const declared = new Set((manifest.actions ?? []).map((action) => action.key));
  for (const key of REGISTERED_ACTIONS) {
    assert.ok(declared.has(key), `action "${key}" is registered but not declared`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('every value-carrying config field is known by the code', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config field "${field.key}" has no entry in DEFAULT_CONFIG`,
    );
  }
});

test('the region options are exactly the data centers the code knows', () => {
  const regionField = manifest.config_schema.find((field) => field.key === 'region');
  assert.deepEqual(
    regionField.options.map((option) => option.value).sort(),
    Object.keys(DATA_CENTERS).sort(),
  );
});

test('the secret credential is declared as a secret, never as a plain string', () => {
  const secretField = manifest.config_schema.find((field) => field.key === 'access_secret');
  assert.equal(secretField.type, 'secret');
  // A `secret` field must carry no default: the schema rejects it, and a
  // default credential would make no sense anyway.
  assert.equal(secretField.default, undefined);
});

test('the refresh interval bounds are declared in the manifest', () => {
  const field = manifest.config_schema.find((entry) => entry.key === 'refresh_interval');
  assert.equal(typeof field.min, 'number');
  assert.equal(typeof field.max, 'number');
  assert.ok(field.min < field.max);
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((field) => field.type === 'section');
  assert.ok(sections.length > 0, 'the onboarding needs at least one section block');
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the dynamic device select declares a source and no static options', () => {
  const dynamicSelects = (manifest.actions ?? [])
    .flatMap((action) => action.fields ?? [])
    .filter((field) => field.source !== undefined);
  assert.ok(dynamicSelects.length > 0, 'the locate action targets a device');
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices', 'the only core-defined source in V1 is "devices"');
    assert.equal(
      field.options,
      undefined,
      `field "${field.key}": declaring source and options together rejects the manifest`,
    );
  }
});

test('the integration declares the cloud transport only', () => {
  // Everything goes through the Tuya cloud: declaring "local" too would show
  // a "Prefer the local connection" toggle this integration cannot honor.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the manifest version and the docker image tag follow package.json', () => {
  assert.equal(manifest.version, packageJson.version);
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    'the docker_image tag must be the manifest version',
  );
});

// A `source: "devices"` field only validates on a core that resolves dynamic
// options (Gladys 5.1.0): below that, every action carrying one fails.
test('an action field with a device source requires Gladys 5.1.0', () => {
  const usesDeviceSource = (manifest.actions ?? []).some((action) =>
    (action.fields ?? []).some((field) => field.source === 'devices'),
  );
  if (usesDeviceSource) {
    const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
    assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  }
});
