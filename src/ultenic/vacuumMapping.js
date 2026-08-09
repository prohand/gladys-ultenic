// -----------------------------------------------------------------------------
// Translation layer between the Tuya data points of a robot vacuum and the
// Gladys `vacuum-cleaner` device category.
//
// Everything here is a PURE function over plain objects: no network, no SDK.
// That is on purpose — this is the part of the integration that is hard to get
// right (every vendor exposes a slightly different subset of data points), so
// it is the part that is fully unit tested.
//
// Two vocabularies meet in this file:
//   - Tuya "data points" (DP): string codes (`status`, `suction`, `power_go`…)
//     whose set and allowed values are declared per product by the device
//     specification. Two Ultenic models rarely expose the same subset.
//   - Gladys `vacuum-cleaner` features: four integer features (state, run
//     mode, clean mode, dock) whose values are fixed by the Gladys core.
//
// Because the Tuya side varies, nothing is hard-assumed: the integration reads
// the device specification, and every command is expressed as an ordered list
// of candidates — the first one the device actually supports wins.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'vacuum-mapping' });

// ---------------------------------------------------------------------------
// Gladys side: the integer values of the `vacuum-cleaner` features.
// They are defined by the Gladys core (server/utils/constants.js:
// VACUUM_CLEANER_STATE / _MODE / _CLEAN_MODE) and are NOT exported by the SDK,
// which only ships the categories and feature types — hence this local mirror.
// ---------------------------------------------------------------------------
export const GLADYS_VACUUM_STATE = {
  STOPPED: 0,
  RUNNING: 1,
  PAUSED: 2,
  ERROR: 3,
  RETURNING_TO_DOCK: 4,
  CHARGING: 5,
  DOCKED: 6,
};

export const GLADYS_VACUUM_RUN_MODE = {
  IDLE: 0,
  CLEANING: 1,
  MAPPING: 2,
};

export const GLADYS_VACUUM_CLEAN_MODE = {
  AUTO: 0,
  QUICK: 1,
  QUIET: 2,
  LOW_NOISE: 3,
  DEEP_CLEAN: 4,
  VACUUM: 5,
  MOP: 6,
};

// ---------------------------------------------------------------------------
// Tuya side: the data point codes of the `sd` (robot vacuum) category.
// ---------------------------------------------------------------------------
export const DP = {
  STATUS: 'status',
  MODE: 'mode',
  PAUSE: 'pause',
  POWER_GO: 'power_go',
  SWITCH_GO: 'switch_go',
  SWITCH_CHARGE: 'switch_charge',
  SEEK: 'seek',
  FIND_ROBOT: 'find_robot',
  SUCTION: 'suction',
  ELECTRICITY_LEFT: 'electricity_left',
  BATTERY_PERCENTAGE: 'battery_percentage',
  CLEAN_AREA: 'clean_area',
  CLEAN_TIME: 'clean_time',
  FILTER: 'filter',
  FAULT: 'fault',
};

// Tuya `status` values -> Gladys operational state. The vocabulary is not
// strictly normalized across products, so the table stays generous: an
// unknown value is reported as such in the logs rather than silently mapped.
const TUYA_STATUS_TO_GLADYS_STATE = {
  // Not cleaning, not on the dock
  standby: GLADYS_VACUUM_STATE.STOPPED,
  sleep: GLADYS_VACUUM_STATE.STOPPED,
  idle: GLADYS_VACUUM_STATE.STOPPED,
  // Cleaning, whatever the pattern
  cleaning: GLADYS_VACUUM_STATE.RUNNING,
  smart: GLADYS_VACUUM_STATE.RUNNING,
  smart_clean: GLADYS_VACUUM_STATE.RUNNING,
  random: GLADYS_VACUUM_STATE.RUNNING,
  wall_follow: GLADYS_VACUUM_STATE.RUNNING,
  wall_clean: GLADYS_VACUUM_STATE.RUNNING,
  spiral: GLADYS_VACUUM_STATE.RUNNING,
  single: GLADYS_VACUUM_STATE.RUNNING,
  spot_clean: GLADYS_VACUUM_STATE.RUNNING,
  zone_clean: GLADYS_VACUUM_STATE.RUNNING,
  pick_zone_clean: GLADYS_VACUUM_STATE.RUNNING,
  part_clean: GLADYS_VACUUM_STATE.RUNNING,
  mop_clean: GLADYS_VACUUM_STATE.RUNNING,
  selectroom: GLADYS_VACUUM_STATE.RUNNING,
  edge: GLADYS_VACUUM_STATE.RUNNING,
  totalclean: GLADYS_VACUUM_STATE.RUNNING,
  curve: GLADYS_VACUUM_STATE.RUNNING,
  goto_pos: GLADYS_VACUUM_STATE.RUNNING,
  pos_arrived: GLADYS_VACUUM_STATE.RUNNING,
  pos_unarrive: GLADYS_VACUUM_STATE.RUNNING,
  // Paused mid-run
  paused: GLADYS_VACUUM_STATE.PAUSED,
  pause: GLADYS_VACUUM_STATE.PAUSED,
  // On its way back to the dock
  goto_charge: GLADYS_VACUUM_STATE.RETURNING_TO_DOCK,
  chargego: GLADYS_VACUUM_STATE.RETURNING_TO_DOCK,
  to_charge: GLADYS_VACUUM_STATE.RETURNING_TO_DOCK,
  docking: GLADYS_VACUUM_STATE.RETURNING_TO_DOCK,
  // On the dock, taking a charge
  charging: GLADYS_VACUUM_STATE.CHARGING,
  charging_pause: GLADYS_VACUUM_STATE.CHARGING,
  // On the dock, charged
  charge_done: GLADYS_VACUUM_STATE.DOCKED,
  chargecompleted: GLADYS_VACUUM_STATE.DOCKED,
  charge_finish: GLADYS_VACUUM_STATE.DOCKED,
  fullcharge: GLADYS_VACUUM_STATE.DOCKED,
  standby_charge: GLADYS_VACUUM_STATE.DOCKED,
  // Something is wrong
  fault: GLADYS_VACUUM_STATE.ERROR,
  error: GLADYS_VACUUM_STATE.ERROR,
  malfunction: GLADYS_VACUUM_STATE.ERROR,
};

// Tuya `suction` values -> Gladys clean mode, for READING the current mode.
// The two vocabularies do not have the same granularity (Tuya describes a
// suction power, Gladys a cleaning intent), so the mapping is lossy on
// purpose: two suction levels can read back as the same Gladys mode.
const SUCTION_TO_CLEAN_MODE = {
  closed: GLADYS_VACUUM_CLEAN_MODE.MOP, // no suction at all: mopping pass
  gentle: GLADYS_VACUUM_CLEAN_MODE.QUIET,
  quiet: GLADYS_VACUUM_CLEAN_MODE.QUIET,
  silent: GLADYS_VACUUM_CLEAN_MODE.QUIET,
  mute: GLADYS_VACUUM_CLEAN_MODE.QUIET,
  low: GLADYS_VACUUM_CLEAN_MODE.QUIET,
  normal: GLADYS_VACUUM_CLEAN_MODE.AUTO,
  standard: GLADYS_VACUUM_CLEAN_MODE.AUTO,
  auto: GLADYS_VACUUM_CLEAN_MODE.AUTO,
  middle: GLADYS_VACUUM_CLEAN_MODE.AUTO,
  medium: GLADYS_VACUUM_CLEAN_MODE.AUTO,
  strong: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
  high: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
  turbo: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
  max: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
  super: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
  powerful: GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN,
};

// Gladys clean mode -> ordered Tuya `suction` candidates, for WRITING. The
// first value the device declares in its specification wins; when it declares
// none of them the command is refused with an explicit message rather than
// sent blindly.
const CLEAN_MODE_TO_SUCTION_CANDIDATES = {
  [GLADYS_VACUUM_CLEAN_MODE.MOP]: ['closed'],
  [GLADYS_VACUUM_CLEAN_MODE.QUIET]: ['quiet', 'gentle', 'silent', 'mute', 'low'],
  [GLADYS_VACUUM_CLEAN_MODE.LOW_NOISE]: ['quiet', 'gentle', 'silent', 'mute', 'low', 'closed'],
  [GLADYS_VACUUM_CLEAN_MODE.AUTO]: ['normal', 'standard', 'auto', 'middle', 'medium'],
  [GLADYS_VACUUM_CLEAN_MODE.VACUUM]: ['normal', 'standard', 'auto', 'strong'],
  [GLADYS_VACUUM_CLEAN_MODE.QUICK]: ['strong', 'high', 'turbo', 'max', 'normal'],
  [GLADYS_VACUUM_CLEAN_MODE.DEEP_CLEAN]: ['max', 'super', 'powerful', 'strong', 'high', 'turbo'],
};

// Ordered command candidates, expressed as data point writes. Which one is
// used depends on what the device declares: `power_go` on laser models,
// `switch_go` on the gyroscope ones, the `mode` enum on the oldest.
export const START_CANDIDATES = [
  { code: DP.POWER_GO, value: true },
  { code: DP.SWITCH_GO, value: true },
  { code: DP.MODE, value: 'smart' },
  { code: DP.MODE, value: 'auto' },
];

export const STOP_CANDIDATES = [
  { code: DP.POWER_GO, value: false },
  { code: DP.SWITCH_GO, value: false },
  { code: DP.PAUSE, value: true },
  { code: DP.MODE, value: 'standby' },
];

export const DOCK_CANDIDATES = [
  { code: DP.SWITCH_CHARGE, value: true },
  { code: DP.MODE, value: 'chargego' },
  { code: DP.MODE, value: 'goto_charge' },
];

export const LOCATE_CANDIDATES = [
  { code: DP.SEEK, value: true },
  { code: DP.FIND_ROBOT, value: true },
];

/**
 * Turn the Tuya status list into a plain `{ code: value }` object.
 * @param {Array<{ code: string, value: unknown }>} statusList the raw Tuya status
 * @returns {Record<string, unknown>} the data points, keyed by code
 */
export function toStatusMap(statusList = []) {
  const map = {};
  for (const entry of statusList) {
    if (entry && typeof entry.code === 'string') {
      map[entry.code] = entry.value;
    }
  }
  return map;
}

/**
 * Read the capabilities of a vacuum from its Tuya specification: which data
 * points can be written, which can be read, the allowed values of the enums
 * and the scale of the numeric ones.
 * @param {{ functions?: Array<object>, status?: Array<object> }} specification the Tuya specification
 * @returns {{ functionCodes: Set<string>, statusCodes: Set<string>, enumRanges: Record<string, string[]>, scales: Record<string, number> }} the parsed capabilities
 */
export function parseCapabilities(specification = {}) {
  const functionCodes = new Set();
  const statusCodes = new Set();
  const enumRanges = {};
  const scales = {};

  const readEntry = (entry, codes) => {
    if (!entry || typeof entry.code !== 'string') {
      return;
    }
    codes.add(entry.code);
    // `values` is a JSON string, e.g. '{"range":["gentle","normal"]}' for an
    // enum or '{"min":0,"max":100,"scale":0,"step":1}' for an integer.
    let parsed;
    try {
      parsed = typeof entry.values === 'string' ? JSON.parse(entry.values) : (entry.values ?? {});
    } catch {
      logger.debug(`Unparsable values for data point ${entry.code}, ignored`);
      return;
    }
    if (Array.isArray(parsed.range)) {
      enumRanges[entry.code] = parsed.range.map(String);
    }
    if (Number.isFinite(Number(parsed.scale))) {
      scales[entry.code] = Number(parsed.scale);
    }
  };

  for (const entry of specification.functions ?? []) {
    readEntry(entry, functionCodes);
  }
  for (const entry of specification.status ?? []) {
    readEntry(entry, statusCodes);
  }

  return { functionCodes, statusCodes, enumRanges, scales };
}

/**
 * Capabilities of a vacuum whose specification could not be read: everything
 * is considered possible, so the integration degrades to "try the first
 * candidate" instead of refusing every command.
 * @returns {{ functionCodes: Set<string>, statusCodes: Set<string>, enumRanges: Record<string, string[]>, scales: Record<string, number>, unknown: boolean }} permissive capabilities
 */
export function unknownCapabilities() {
  return {
    functionCodes: new Set(),
    statusCodes: new Set(),
    enumRanges: {},
    scales: {},
    unknown: true,
  };
}

/**
 * Can this exact data point write be sent to this device?
 * @param {object} capabilities the parsed capabilities
 * @param {{ code: string, value: unknown }} command the candidate command
 * @returns {boolean} true when the device declares the code (and the value, for enums)
 */
export function supportsCommand(capabilities, command) {
  if (capabilities.unknown) {
    return true;
  }
  if (!capabilities.functionCodes.has(command.code)) {
    return false;
  }
  const range = capabilities.enumRanges[command.code];
  if (range && typeof command.value === 'string') {
    return range.includes(command.value);
  }
  return true;
}

/**
 * Pick the first candidate command the device supports.
 * @param {object} capabilities the parsed capabilities
 * @param {Array<{ code: string, value: unknown }>} candidates the ordered candidates
 * @returns {{ code: string, value: unknown }|null} the command to send, or null
 */
export function pickCommand(capabilities, candidates) {
  return candidates.find((candidate) => supportsCommand(capabilities, candidate)) ?? null;
}

/**
 * Compute the Gladys operational state from the data points of the vacuum.
 * @param {Record<string, unknown>} statusMap the data points, keyed by code
 * @returns {number|null} a GLADYS_VACUUM_STATE value, or null when undecidable
 */
export function mapStateFromStatus(statusMap = {}) {
  // A non-zero fault bitmap beats everything else: the vacuum may still
  // report "cleaning" while being stuck on a cable.
  const fault = Number(statusMap[DP.FAULT]);
  if (Number.isFinite(fault) && fault > 0) {
    return GLADYS_VACUUM_STATE.ERROR;
  }

  const rawStatus = statusMap[DP.STATUS];
  if (typeof rawStatus === 'string' && rawStatus.length > 0) {
    const mapped = TUYA_STATUS_TO_GLADYS_STATE[rawStatus.toLowerCase()];
    if (mapped !== undefined) {
      // A device can report `status: cleaning` and `pause: true` at once
      // (paused mid-run): the pause flag is the more precise of the two.
      if (mapped === GLADYS_VACUUM_STATE.RUNNING && statusMap[DP.PAUSE] === true) {
        return GLADYS_VACUUM_STATE.PAUSED;
      }
      return mapped;
    }
    logger.warn(`Unknown Tuya vacuum status "${rawStatus}", state not published`);
    return null;
  }

  // No `status` data point at all: fall back on the switches.
  if (statusMap[DP.PAUSE] === true) {
    return GLADYS_VACUUM_STATE.PAUSED;
  }
  if (statusMap[DP.POWER_GO] === true || statusMap[DP.SWITCH_GO] === true) {
    return GLADYS_VACUUM_STATE.RUNNING;
  }
  if (statusMap[DP.POWER_GO] === false || statusMap[DP.SWITCH_GO] === false) {
    return GLADYS_VACUUM_STATE.STOPPED;
  }
  return null;
}

/**
 * Derive the Gladys run mode from the operational state. Gladys splits "what
 * the machine is doing" (state, read-only) from "what it was told to do"
 * (run mode, commandable); Tuya only reports the former, so the run mode is
 * the state seen through a coarser lens.
 * @param {number|null} state a GLADYS_VACUUM_STATE value
 * @returns {number|null} a GLADYS_VACUUM_RUN_MODE value, or null
 */
export function mapRunModeFromState(state) {
  if (state === null) {
    return null;
  }
  return state === GLADYS_VACUUM_STATE.RUNNING
    ? GLADYS_VACUUM_RUN_MODE.CLEANING
    : GLADYS_VACUUM_RUN_MODE.IDLE;
}

/**
 * Map the current Tuya suction level to a Gladys clean mode.
 * @param {unknown} suction the raw `suction` data point
 * @returns {number|null} a GLADYS_VACUUM_CLEAN_MODE value, or null when unknown
 */
export function mapCleanModeFromSuction(suction) {
  if (typeof suction !== 'string') {
    return null;
  }
  const mapped = SUCTION_TO_CLEAN_MODE[suction.toLowerCase()];
  if (mapped === undefined) {
    logger.warn(`Unknown Tuya suction level "${suction}", clean mode not published`);
    return null;
  }
  return mapped;
}

/**
 * Pick the Tuya suction level to send for a Gladys clean mode.
 * @param {number} cleanMode a GLADYS_VACUUM_CLEAN_MODE value
 * @param {object} capabilities the parsed capabilities
 * @returns {string|null} the suction value to write, or null when unsupported
 */
export function pickSuctionForCleanMode(cleanMode, capabilities) {
  const candidates = CLEAN_MODE_TO_SUCTION_CANDIDATES[cleanMode];
  if (!candidates) {
    return null;
  }
  const range = capabilities.enumRanges[DP.SUCTION];
  if (!range) {
    // Specification unavailable: send the preferred value and let the cloud
    // reject it if the model does not know it.
    return capabilities.unknown ? candidates[0] : null;
  }
  return candidates.find((candidate) => range.includes(candidate)) ?? null;
}

/**
 * Apply the Tuya `scale` of a numeric data point (a scale of 1 means the
 * cloud sends tenths).
 * @param {unknown} value the raw data point value
 * @param {number} [scale] the scale declared in the specification
 * @returns {number|null} the human-readable number, or null when not a number
 */
export function scaleValue(value, scale = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    return parsed;
  }
  return parsed / 10 ** scale;
}

/**
 * Read the battery level, whichever data point the model uses for it.
 * @param {Record<string, unknown>} statusMap the data points, keyed by code
 * @returns {number|null} the battery percentage, or null when not reported
 */
export function readBatteryLevel(statusMap = {}) {
  for (const code of [DP.ELECTRICITY_LEFT, DP.BATTERY_PERCENTAGE]) {
    const value = Number(statusMap[code]);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
  }
  return null;
}

/**
 * Does the device report at least one battery data point?
 * @param {object} capabilities the parsed capabilities
 * @param {Record<string, unknown>} statusMap the current data points
 * @returns {boolean} true when a battery feature should be exposed
 */
export function hasBattery(capabilities, statusMap = {}) {
  return hasDataPoint(capabilities, statusMap, [DP.ELECTRICITY_LEFT, DP.BATTERY_PERCENTAGE]);
}

/**
 * Does the device expose one of these data points, either in its
 * specification or in the status it is reporting right now?
 * @param {object} capabilities the parsed capabilities
 * @param {Record<string, unknown>} statusMap the current data points
 * @param {string[]} codes the data point codes to look for
 * @returns {boolean} true when at least one is available
 */
export function hasDataPoint(capabilities, statusMap = {}, codes = []) {
  return codes.some(
    (code) =>
      capabilities.statusCodes.has(code) ||
      capabilities.functionCodes.has(code) ||
      statusMap[code] !== undefined,
  );
}
