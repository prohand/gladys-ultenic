import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCK_CANDIDATES,
  DP,
  GLADYS_VACUUM_CLEAN_MODE,
  GLADYS_VACUUM_RUN_MODE,
  GLADYS_VACUUM_STATE,
  START_CANDIDATES,
  STOP_CANDIDATES,
  hasBattery,
  hasDataPoint,
  mapCleanModeFromSuction,
  mapRunModeFromState,
  mapStateFromStatus,
  parseCapabilities,
  pickCommand,
  pickSuctionForCleanMode,
  readBatteryLevel,
  scaleValue,
  toStatusMap,
  unknownCapabilities,
} from '../src/ultenic/vacuumMapping.js';
import { tuyaVacuumSpecification } from './helpers/tuyaFixtures.js';

const capabilities = parseCapabilities(tuyaVacuumSpecification());

test('toStatusMap turns the Tuya status list into a keyed object', () => {
  const map = toStatusMap([
    { code: 'status', value: 'charging' },
    { code: 'electricity_left', value: 42 },
  ]);
  assert.deepEqual(map, { status: 'charging', electricity_left: 42 });
});

test('toStatusMap tolerates a missing or malformed list', () => {
  assert.deepEqual(toStatusMap(), {});
  assert.deepEqual(toStatusMap([null, { value: 1 }]), {});
});

test('parseCapabilities extracts the writable codes, the enum ranges and the scales', () => {
  assert.ok(capabilities.functionCodes.has('power_go'));
  assert.ok(capabilities.statusCodes.has('electricity_left'));
  assert.deepEqual(capabilities.enumRanges.suction, ['closed', 'gentle', 'normal', 'strong']);
  assert.equal(capabilities.scales.clean_area, 0);
});

test('parseCapabilities survives an unparsable values field', () => {
  const parsed = parseCapabilities({ functions: [{ code: 'weird', values: 'not json' }] });
  assert.ok(parsed.functionCodes.has('weird'));
  assert.equal(parsed.enumRanges.weird, undefined);
});

test('mapStateFromStatus maps the documented Tuya statuses', () => {
  const cases = [
    ['standby', GLADYS_VACUUM_STATE.STOPPED],
    ['smart', GLADYS_VACUUM_STATE.RUNNING],
    ['paused', GLADYS_VACUUM_STATE.PAUSED],
    ['goto_charge', GLADYS_VACUUM_STATE.RETURNING_TO_DOCK],
    ['charging', GLADYS_VACUUM_STATE.CHARGING],
    ['charge_done', GLADYS_VACUUM_STATE.DOCKED],
  ];
  for (const [tuyaStatus, expected] of cases) {
    assert.equal(mapStateFromStatus({ [DP.STATUS]: tuyaStatus }), expected, tuyaStatus);
  }
});

test('mapStateFromStatus reports an error when the fault bitmap is set', () => {
  // The vacuum keeps saying "cleaning" while stuck on a cable: the fault wins.
  const state = mapStateFromStatus({ [DP.STATUS]: 'smart', [DP.FAULT]: 4 });
  assert.equal(state, GLADYS_VACUUM_STATE.ERROR);
});

test('mapStateFromStatus prefers the pause flag over a running status', () => {
  const state = mapStateFromStatus({ [DP.STATUS]: 'cleaning', [DP.PAUSE]: true });
  assert.equal(state, GLADYS_VACUUM_STATE.PAUSED);
});

test('mapStateFromStatus falls back on the switches when there is no status', () => {
  assert.equal(mapStateFromStatus({ [DP.POWER_GO]: true }), GLADYS_VACUUM_STATE.RUNNING);
  assert.equal(mapStateFromStatus({ [DP.SWITCH_GO]: false }), GLADYS_VACUUM_STATE.STOPPED);
  assert.equal(mapStateFromStatus({ [DP.PAUSE]: true }), GLADYS_VACUUM_STATE.PAUSED);
});

test('mapStateFromStatus returns null rather than guessing an unknown status', () => {
  assert.equal(mapStateFromStatus({ [DP.STATUS]: 'hyperdrive' }), null);
  assert.equal(mapStateFromStatus({}), null);
});

test('mapRunModeFromState only reports cleaning while the vacuum runs', () => {
  assert.equal(mapRunModeFromState(GLADYS_VACUUM_STATE.RUNNING), GLADYS_VACUUM_RUN_MODE.CLEANING);
  assert.equal(mapRunModeFromState(GLADYS_VACUUM_STATE.DOCKED), GLADYS_VACUUM_RUN_MODE.IDLE);
  assert.equal(mapRunModeFromState(null), null);
});

test('mapCleanModeFromSuction maps the suction levels to clean modes', () => {
  assert.equal(mapCleanModeFromSuction('closed'), GLADYS_VACUUM_CLEAN_MODE.MOP);
  assert.equal(mapCleanModeFromSuction('gentle'), GLADYS_VACUUM_CLEAN_MODE.QUIET);
  assert.equal(mapCleanModeFromSuction('normal'), GLADYS_VACUUM_CLEAN_MODE.AUTO);
  assert.equal(mapCleanModeFromSuction('strong'), GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN);
  assert.equal(mapCleanModeFromSuction('unknown-level'), null);
  assert.equal(mapCleanModeFromSuction(undefined), null);
});

test('pickSuctionForCleanMode only proposes a level the device declares', () => {
  // This fixture declares closed/gentle/normal/strong, but no "max".
  assert.equal(pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.QUIET, capabilities), 'gentle');
  assert.equal(pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.AUTO, capabilities), 'normal');
  assert.equal(
    pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN, capabilities),
    'strong',
  );
  assert.equal(pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.MOP, capabilities), 'closed');
});

test('pickSuctionForCleanMode refuses a mode the device cannot do', () => {
  const noMop = parseCapabilities({
    functions: [{ code: 'suction', values: '{"range":["gentle","normal"]}' }],
  });
  assert.equal(pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.MOP, noMop), null);
});

test('pickSuctionForCleanMode falls back to the preferred level without a specification', () => {
  assert.equal(
    pickSuctionForCleanMode(GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN, unknownCapabilities()),
    'max',
  );
});

test('pickCommand walks the candidates until one is supported', () => {
  assert.deepEqual(pickCommand(capabilities, START_CANDIDATES), { code: 'power_go', value: true });
  assert.deepEqual(pickCommand(capabilities, STOP_CANDIDATES), { code: 'power_go', value: false });
  assert.deepEqual(pickCommand(capabilities, DOCK_CANDIDATES), {
    code: 'switch_charge',
    value: true,
  });
});

test('pickCommand skips a mode value the device does not declare', () => {
  // Only the `mode` enum exists here, and it does not know "smart": the start
  // command must fall through to "auto"... which it does not know either.
  const modeOnly = parseCapabilities({
    functions: [{ code: 'mode', values: '{"range":["standby","chargego"]}' }],
  });
  assert.equal(pickCommand(modeOnly, START_CANDIDATES), null);
  assert.deepEqual(pickCommand(modeOnly, STOP_CANDIDATES), { code: 'mode', value: 'standby' });
  assert.deepEqual(pickCommand(modeOnly, DOCK_CANDIDATES), { code: 'mode', value: 'chargego' });
});

test('pickCommand accepts anything when the specification is unknown', () => {
  assert.deepEqual(pickCommand(unknownCapabilities(), START_CANDIDATES), START_CANDIDATES[0]);
});

test('scaleValue divides by the Tuya scale', () => {
  assert.equal(scaleValue(235, 1), 23.5);
  assert.equal(scaleValue(42, 0), 42);
  assert.equal(scaleValue('17'), 17);
  assert.equal(scaleValue(undefined), null);
  assert.equal(scaleValue('not a number'), null);
});

test('readBatteryLevel accepts either battery data point and clamps it', () => {
  assert.equal(readBatteryLevel({ electricity_left: 64 }), 64);
  assert.equal(readBatteryLevel({ battery_percentage: 12 }), 12);
  assert.equal(readBatteryLevel({ electricity_left: 140 }), 100);
  assert.equal(readBatteryLevel({}), null);
});

test('hasDataPoint looks at the specification AND at the live status', () => {
  assert.equal(hasDataPoint(capabilities, {}, [DP.CLEAN_AREA]), true);
  assert.equal(hasDataPoint(capabilities, {}, ['water_reset']), false);
  // A model whose specification is unavailable still exposes what it reports.
  assert.equal(hasDataPoint(unknownCapabilities(), { water_reset: 1 }, ['water_reset']), true);
});

test('hasBattery accepts either of the two battery data points', () => {
  assert.equal(hasBattery(capabilities, {}), true);
  assert.equal(hasBattery(unknownCapabilities(), { battery_percentage: 50 }), true);
  assert.equal(hasBattery(unknownCapabilities(), {}), false);
});
