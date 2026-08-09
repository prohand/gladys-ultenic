import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { FEATURE, createVacuum } from '../src/devices/vacuum.js';
import {
  GLADYS_VACUUM_CLEAN_MODE,
  GLADYS_VACUUM_RUN_MODE,
  GLADYS_VACUUM_STATE,
  parseCapabilities,
  toStatusMap,
  unknownCapabilities,
} from '../src/ultenic/vacuumMapping.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { tuyaVacuumDevice, tuyaVacuumSpecification } from './helpers/tuyaFixtures.js';

/**
 * Build a vacuum blueprint on top of the shared fixtures.
 * @param {object} [options] optional overrides
 * @param {object} [options.device] Tuya device overrides
 * @param {object} [options.capabilities] capabilities to use
 * @returns {object} the blueprint
 */
function buildVacuum({ device = {}, capabilities } = {}) {
  const tuyaDevice = tuyaVacuumDevice(device);
  return createVacuum({
    tuyaDevice,
    capabilities: capabilities ?? parseCapabilities(tuyaVacuumSpecification()),
    statusMap: toStatusMap(tuyaDevice.status),
  });
}

/**
 * Recording Tuya client: keeps the commands instead of sending them.
 * @returns {{ sent: Array<object>, sendCommands: Function }} the fake client
 */
function createFakeClient() {
  const sent = [];
  return {
    sent,
    async sendCommands(deviceId, commands) {
      sent.push({ deviceId, commands });
      return true;
    },
  };
}

test('the discovery payload carries the four vacuum-cleaner features', () => {
  const gladys = createFakeGladys();
  const device = buildVacuum().buildDevice(gladys);

  assert.equal(device.name, 'Ultenic T10');
  assert.match(device.external_id, /^ext:ultenic:vacuum:bf1234567890abcdef$/);

  const vacuumFeatures = device.features.filter(
    (feature) => feature.category === DEVICE_FEATURE_CATEGORIES.VACUUM_CLEANER,
  );
  assert.deepEqual(
    vacuumFeatures.map((feature) => feature.type).sort(),
    [
      DEVICE_FEATURE_TYPES.VACUUM_CLEANER.CLEAN_MODE,
      DEVICE_FEATURE_TYPES.VACUUM_CLEANER.DOCK,
      DEVICE_FEATURE_TYPES.VACUUM_CLEANER.RUN_MODE,
      DEVICE_FEATURE_TYPES.VACUUM_CLEANER.STATE,
    ].sort(),
  );
});

test('the operational state is read-only and the commands are not', () => {
  const gladys = createFakeGladys();
  const device = buildVacuum().buildDevice(gladys);
  const byType = Object.fromEntries(device.features.map((feature) => [feature.type, feature]));

  assert.equal(byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.STATE].read_only, true);
  assert.equal(byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.RUN_MODE].read_only, false);
  assert.equal(byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.DOCK].read_only, false);
  // The dock is a button: nothing to feed back, the state feature reports it.
  assert.equal(byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.DOCK].has_feedback, false);
});

test('the feature bounds match what the Gladys core expects', () => {
  const gladys = createFakeGladys();
  const device = buildVacuum().buildDevice(gladys);
  const byType = Object.fromEntries(device.features.map((feature) => [feature.type, feature]));

  assert.deepEqual(
    [
      byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.RUN_MODE].min,
      byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.RUN_MODE].max,
    ],
    [0, 2],
  );
  assert.deepEqual(
    [
      byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.CLEAN_MODE].min,
      byType[DEVICE_FEATURE_TYPES.VACUUM_CLEANER.CLEAN_MODE].max,
    ],
    [0, 6],
  );
});

test('every published external_id is unique inside a device', () => {
  const gladys = createFakeGladys();
  const device = buildVacuum().buildDevice(gladys);
  const ids = device.features.map((feature) => feature.external_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the sensors are only exposed when the vacuum reports them', () => {
  const gladys = createFakeGladys();
  const bare = createVacuum({
    tuyaDevice: tuyaVacuumDevice({ status: [{ code: 'status', value: 'standby' }] }),
    capabilities: unknownCapabilities(),
    statusMap: { status: 'standby' },
  });
  const categories = bare.buildDevice(gladys).features.map((feature) => feature.category);

  assert.ok(!categories.includes(DEVICE_FEATURE_CATEGORIES.BATTERY));
  assert.ok(!categories.includes(DEVICE_FEATURE_CATEGORIES.SURFACE));
  // ...while the fully-featured fixture does expose them.
  const rich = buildVacuum()
    .buildDevice(gladys)
    .features.map((feature) => feature.category);
  assert.ok(rich.includes(DEVICE_FEATURE_CATEGORIES.BATTERY));
  assert.ok(rich.includes(DEVICE_FEATURE_CATEGORIES.SURFACE));
  assert.ok(rich.includes(DEVICE_FEATURE_CATEGORIES.DURATION));
  assert.ok(rich.includes(DEVICE_FEATURE_CATEGORIES.HEPA_FILTER_MONITORING));
});

test('buildStates translates the Tuya data points into Gladys states', () => {
  const gladys = createFakeGladys();
  const vacuum = buildVacuum();
  const states = Object.fromEntries(
    vacuum
      .buildStates(gladys)
      .map((state) => [state.device_feature_external_id.split(':').pop(), state.state]),
  );

  assert.equal(states[FEATURE.STATE], GLADYS_VACUUM_STATE.CHARGING);
  assert.equal(states[FEATURE.RUN_MODE], GLADYS_VACUUM_RUN_MODE.IDLE);
  assert.equal(states[FEATURE.CLEAN_MODE], GLADYS_VACUUM_CLEAN_MODE.AUTO);
  assert.equal(states.battery, 64);
  assert.equal(states['clean-area'], 23);
  assert.equal(states['clean-time'], 41);
  assert.equal(states['filter-life'], 87);
});

test('buildStates skips the data points the vacuum does not report', () => {
  const gladys = createFakeGladys();
  const vacuum = createVacuum({
    tuyaDevice: tuyaVacuumDevice(),
    capabilities: unknownCapabilities(),
    statusMap: { status: 'smart' },
  });
  const keys = vacuum
    .buildStates(gladys)
    .map((state) => state.device_feature_external_id.split(':').pop());
  assert.deepEqual(keys.sort(), [FEATURE.RUN_MODE, FEATURE.STATE].sort());
});

test('updateStatusMap is what the refresh loop publishes next', () => {
  const gladys = createFakeGladys();
  const vacuum = buildVacuum();
  vacuum.updateStatusMap({ status: 'smart', electricity_left: 30 });
  const states = Object.fromEntries(
    vacuum
      .buildStates(gladys)
      .map((state) => [state.device_feature_external_id.split(':').pop(), state.state]),
  );
  assert.equal(states[FEATURE.STATE], GLADYS_VACUUM_STATE.RUNNING);
  assert.equal(states.battery, 30);
});

test('the transport badge reports cloud, and unreachable when the vacuum is offline', () => {
  assert.deepEqual(buildVacuum().transport(), { transport: DEVICE_TRANSPORTS.CLOUD });
  assert.deepEqual(buildVacuum({ device: { online: false } }).transport(), {
    transport: DEVICE_TRANSPORTS.UNREACHABLE,
  });
});

test('setting the run mode to CLEANING starts the vacuum', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum();
  const feature = { external_id: vacuum.deviceExternalId(gladys) + `:${FEATURE.RUN_MODE}` };

  await vacuum.onSetValue(gladys, {
    feature,
    value: GLADYS_VACUUM_RUN_MODE.CLEANING,
    client,
  });

  assert.deepEqual(client.sent, [
    { deviceId: 'bf1234567890abcdef', commands: [{ code: 'power_go', value: true }] },
  ]);
  // has_feedback: the requested value is published so the UI reacts at once.
  assert.deepEqual(gladys.published, [
    { featureExternalId: feature.external_id, state: GLADYS_VACUUM_RUN_MODE.CLEANING },
  ]);
});

test('setting the run mode to IDLE stops the vacuum', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum();

  await vacuum.onSetValue(gladys, {
    feature: { external_id: `${vacuum.deviceExternalId(gladys)}:${FEATURE.RUN_MODE}` },
    value: GLADYS_VACUUM_RUN_MODE.IDLE,
    client,
  });

  assert.deepEqual(client.sent[0].commands, [{ code: 'power_go', value: false }]);
});

test('the mapping run mode is refused instead of doing something else', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum();

  await assert.rejects(
    () =>
      vacuum.onSetValue(gladys, {
        feature: { external_id: `${vacuum.deviceExternalId(gladys)}:${FEATURE.RUN_MODE}` },
        value: GLADYS_VACUUM_RUN_MODE.MAPPING,
        client,
      }),
    /Mapping mode is not supported/,
  );
  assert.equal(client.sent.length, 0);
});

test('setting the clean mode writes the matching suction level', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum();

  await vacuum.onSetValue(gladys, {
    feature: { external_id: `${vacuum.deviceExternalId(gladys)}:${FEATURE.CLEAN_MODE}` },
    value: GLADYS_VACUUM_CLEAN_MODE.QUIET,
    client,
  });

  assert.deepEqual(client.sent[0].commands, [{ code: 'suction', value: 'gentle' }]);
});

test('a clean mode the vacuum cannot do fails loudly', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum({
    capabilities: parseCapabilities({
      functions: [{ code: 'suction', values: '{"range":["gentle","normal"]}' }],
    }),
  });

  await assert.rejects(
    () =>
      vacuum.onSetValue(gladys, {
        feature: { external_id: `${vacuum.deviceExternalId(gladys)}:${FEATURE.CLEAN_MODE}` },
        value: GLADYS_VACUUM_CLEAN_MODE.MOP,
        client,
      }),
    /does not support the clean mode/,
  );
  assert.equal(client.sent.length, 0);
});

test('the dock feature sends the vacuum home on 1 and ignores 0', async () => {
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const vacuum = buildVacuum();
  const feature = { external_id: `${vacuum.deviceExternalId(gladys)}:${FEATURE.DOCK}` };

  await vacuum.onSetValue(gladys, { feature, value: 1, client });
  assert.deepEqual(client.sent[0].commands, [{ code: 'switch_charge', value: true }]);

  await vacuum.onSetValue(gladys, { feature, value: 0, client });
  assert.equal(client.sent.length, 1, 'value 0 is a no-op');
});

test('an unknown feature is rejected rather than silently ignored', async () => {
  const gladys = createFakeGladys();
  const vacuum = buildVacuum();
  await assert.rejects(
    () =>
      vacuum.onSetValue(gladys, {
        feature: { external_id: 'ext:ultenic:vacuum:other:state' },
        value: 1,
        client: createFakeClient(),
      }),
    /not commandable/,
  );
});

test('locate makes the vacuum beep', async () => {
  const client = createFakeClient();
  await buildVacuum().locate(client);
  assert.deepEqual(client.sent[0].commands, [{ code: 'seek', value: true }]);
});

test('locate explains itself on a vacuum that cannot beep', async () => {
  const vacuum = buildVacuum({
    capabilities: parseCapabilities({ functions: [{ code: 'power_go', values: '{}' }] }),
  });
  await assert.rejects(() => vacuum.locate(createFakeClient()), /cannot beep/);
});
