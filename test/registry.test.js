import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { DeviceRegistry } from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { tuyaVacuumDevice, tuyaVacuumSpecification } from './helpers/tuyaFixtures.js';

const CONFIG = normalizeConfig({
  region: 'eu',
  access_id: 'access-id',
  access_secret: 'access-secret',
});

/**
 * Replace the Tuya client of a registry by a scripted fake.
 * @param {DeviceRegistry} registry the registry to patch
 * @param {object} script the fake behaviour
 * @param {Function} script.listVacuums returns the vacuums
 * @param {Function} [script.getSpecification] returns the specification
 * @param {Function} [script.getStatus] returns the status of one device
 * @returns {object} the fake client
 */
function useFakeClient(registry, script) {
  const client = {
    calls: { listVacuums: 0, getSpecification: 0, getStatus: 0 },
    async listVacuums() {
      client.calls.listVacuums += 1;
      return script.listVacuums();
    },
    async getSpecification(deviceId) {
      client.calls.getSpecification += 1;
      return (script.getSpecification ?? tuyaVacuumSpecification)(deviceId);
    },
    async getStatus(deviceId) {
      client.calls.getStatus += 1;
      return script.getStatus(deviceId);
    },
  };
  registry.client = client;
  return client;
}

/**
 * Build a registry already configured, with a fake client installed.
 * @param {object} script the fake client behaviour
 * @returns {{ gladys: object, registry: DeviceRegistry, client: object }} the trio
 */
function createRegistry(script) {
  const gladys = createFakeGladys();
  const registry = new DeviceRegistry(gladys);
  registry.setConfig(CONFIG);
  const client = useFakeClient(registry, script);
  return { gladys, registry, client };
}

test('discover keeps only what the cloud reports and reads each specification once', async () => {
  const { registry, client } = createRegistry({ listVacuums: () => [tuyaVacuumDevice()] });

  await registry.discover();
  await registry.discover();

  assert.equal(registry.vacuums.size, 1);
  assert.equal(client.calls.getSpecification, 1, 'the specification is cached across discoveries');
});

test('a vacuum whose specification cannot be read is still usable', async () => {
  const { registry } = createRegistry({
    listVacuums: () => [tuyaVacuumDevice()],
    getSpecification: () => {
      throw new Error('permission deny');
    },
  });

  const vacuums = await registry.discover();

  assert.equal(vacuums.length, 1);
  assert.equal(vacuums[0].capabilities.unknown, true);
});

test('publishCatalog publishes the devices, their states and their transports', async () => {
  const { gladys, registry } = createRegistry({ listVacuums: () => [tuyaVacuumDevice()] });

  await registry.discover();
  await registry.publishCatalog();

  assert.equal(gladys.discovered.length, 1);
  assert.equal(gladys.discovered[0].length, 1);
  assert.ok(gladys.published.length > 0);
  assert.deepEqual(gladys.transports, [
    {
      external_id: registry.buildDiscoveredDevices()[0].external_id,
      transport: DEVICE_TRANSPORTS.CLOUD,
    },
  ]);
});

test('only the states that changed are republished', async () => {
  let status = [
    { code: 'status', value: 'charging' },
    { code: 'electricity_left', value: 60 },
  ];
  const { gladys, registry } = createRegistry({
    listVacuums: () => [tuyaVacuumDevice({ status })],
  });

  await registry.discover();
  await registry.publishCatalog();
  const afterFirstPublish = gladys.published.length;

  // Nothing moved: the second refresh must publish nothing at all.
  await registry.refreshAll();
  assert.equal(gladys.published.length, afterFirstPublish);

  // The battery drops by one point: exactly one state goes out.
  status = [
    { code: 'status', value: 'charging' },
    { code: 'electricity_left', value: 61 },
  ];
  await registry.refreshAll();
  assert.equal(gladys.published.length, afterFirstPublish + 1);
  assert.equal(gladys.published.at(-1).state, 61);
});

test('the transport badge is only republished when the reachability changes', async () => {
  let online = true;
  const { gladys, registry } = createRegistry({
    listVacuums: () => [tuyaVacuumDevice({ online })],
  });

  await registry.discover();
  await registry.publishCatalog();
  assert.equal(gladys.transports.length, 1);

  await registry.refreshAll();
  assert.equal(gladys.transports.length, 1, 'still online: nothing to say');

  online = false;
  await registry.refreshAll();
  assert.equal(gladys.transports.length, 2);
  assert.equal(gladys.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
});

test('a vacuum added on the account is picked up by the refresh loop', async () => {
  let devices = [tuyaVacuumDevice()];
  const { gladys, registry } = createRegistry({ listVacuums: () => devices });

  await registry.discover();
  await registry.publishCatalog();

  devices = [tuyaVacuumDevice(), tuyaVacuumDevice({ id: 'vacuum-2', name: 'Ultenic D5s' })];
  await registry.refreshAll();

  assert.equal(registry.vacuums.size, 2);
  assert.equal(gladys.discovered.at(-1).length, 2);
});

test('a vacuum removed from the account disappears from the catalog', async () => {
  let devices = [tuyaVacuumDevice(), tuyaVacuumDevice({ id: 'vacuum-2', name: 'Ultenic D5s' })];
  const { gladys, registry } = createRegistry({ listVacuums: () => devices });

  await registry.discover();
  await registry.publishCatalog();
  assert.equal(registry.vacuums.size, 2);

  devices = [tuyaVacuumDevice()];
  await registry.refreshAll();

  assert.equal(registry.vacuums.size, 1);
  assert.equal(gladys.discovered.at(-1).length, 1);
});

test('refreshOne re-reads a single vacuum', async () => {
  const { gladys, registry, client } = createRegistry({
    listVacuums: () => [tuyaVacuumDevice()],
    getStatus: () => [{ code: 'status', value: 'smart' }],
  });

  await registry.discover();
  await registry.publishCatalog();
  const before = gladys.published.length;

  const [vacuum] = [...registry.vacuums.values()];
  await registry.refreshOne(vacuum);

  assert.equal(client.calls.getStatus, 1);
  assert.ok(gladys.published.length > before);
});

test('changing the credentials drops the catalog built with the old ones', async () => {
  const { registry } = createRegistry({ listVacuums: () => [tuyaVacuumDevice()] });
  await registry.discover();
  assert.equal(registry.vacuums.size, 1);

  registry.setConfig(normalizeConfig({ ...CONFIG, access_id: 'another-id' }));

  assert.equal(registry.vacuums.size, 0);
  assert.equal(registry.lastPublishedStates.size, 0);
});

test('changing only the refresh interval keeps the catalog and the client', async () => {
  const { registry, client } = createRegistry({ listVacuums: () => [tuyaVacuumDevice()] });
  await registry.discover();

  registry.setConfig(normalizeConfig({ ...CONFIG, refresh_interval: 120 }));

  assert.equal(registry.vacuums.size, 1);
  assert.equal(registry.client, client);
});

test('an unconfigured registry refuses to call the cloud', () => {
  const registry = new DeviceRegistry(createFakeGladys());
  assert.throws(() => registry.requireClient(), /not configured/);
});

test('a vacuum added in Gladys gets its unchanged values published again', async () => {
  const { gladys, registry } = createRegistry({ listVacuums: () => [tuyaVacuumDevice()] });
  await registry.discover();
  // Published before the user added the device: Gladys dropped them.
  await registry.publishCatalog();
  const firstBatch = gladys.published.length;
  const transports = gladys.transports.length;
  const { external_id: externalId } = registry.buildDiscoveredDevices()[0];

  await registry.republishDevice(externalId);

  assert.equal(gladys.published.length, firstBatch * 2, 'every state published again');
  assert.equal(gladys.transports.length, transports + 1);
  // An unknown device is ignored.
  await registry.republishDevice('ext:ultenic:vacuum:unknown');
  assert.equal(gladys.published.length, firstBatch * 2);
});
