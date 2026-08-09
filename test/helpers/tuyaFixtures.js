// -----------------------------------------------------------------------------
// Payload fixtures shaped like what the Tuya cloud returns for a robot vacuum.
// Kept in one place so every test speaks about the same machine.
// -----------------------------------------------------------------------------

/**
 * A Tuya device entry, as returned by the device listing endpoints.
 * @param {object} [overrides] fields to override
 * @returns {object} the device
 */
export function tuyaVacuumDevice(overrides = {}) {
  return {
    id: 'bf1234567890abcdef',
    name: 'Ultenic T10',
    category: 'sd',
    product_name: 'Robot Vacuum',
    online: true,
    status: [
      { code: 'status', value: 'charging' },
      { code: 'suction', value: 'normal' },
      { code: 'electricity_left', value: 64 },
      { code: 'clean_area', value: 23 },
      { code: 'clean_time', value: 41 },
      { code: 'filter', value: 87 },
      { code: 'fault', value: 0 },
    ],
    ...overrides,
  };
}

/**
 * A Tuya device specification, as returned by /v1.0/devices/{id}/specifications.
 * @returns {{ functions: Array<object>, status: Array<object> }} the specification
 */
export function tuyaVacuumSpecification() {
  return {
    functions: [
      { code: 'power_go', type: 'Boolean', values: '{}' },
      { code: 'switch_charge', type: 'Boolean', values: '{}' },
      { code: 'seek', type: 'Boolean', values: '{}' },
      {
        code: 'mode',
        type: 'Enum',
        values: '{"range":["standby","smart","chargego","zone","pose"]}',
      },
      {
        code: 'suction',
        type: 'Enum',
        values: '{"range":["closed","gentle","normal","strong"]}',
      },
    ],
    status: [
      {
        code: 'status',
        type: 'Enum',
        values: '{"range":["standby","smart","goto_charge","charging","charge_done","paused"]}',
      },
      {
        code: 'suction',
        type: 'Enum',
        values: '{"range":["closed","gentle","normal","strong"]}',
      },
      {
        code: 'electricity_left',
        type: 'Integer',
        values: '{"unit":"%","min":0,"max":100,"scale":0,"step":1}',
      },
      {
        code: 'clean_area',
        type: 'Integer',
        values: '{"unit":"m2","min":0,"max":9999,"scale":0,"step":1}',
      },
      {
        code: 'clean_time',
        type: 'Integer',
        values: '{"unit":"min","min":0,"max":9999,"scale":0,"step":1}',
      },
      {
        code: 'filter',
        type: 'Integer',
        values: '{"unit":"%","min":0,"max":100,"scale":0,"step":1}',
      },
      { code: 'fault', type: 'Bitmap', values: '{"label":["stuck","wheel"]}' },
    ],
  };
}
