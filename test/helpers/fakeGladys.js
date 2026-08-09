// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - publishDiscoveredDevices / publishState / publishStates
//   - publishTransports / setConnectionStatus
// Every call is recorded so the tests can assert on it, without a running
// Gladys server or a real WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const published = [];
  const discovered = [];
  const transports = [];
  const connectionStatuses = [];

  return {
    published,
    discovered,
    transports,
    connectionStatuses,

    externalIds(type, platformId) {
      const device = `ext:ultenic:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
      return { created: devices.length };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const state of states) {
        published.push({
          featureExternalId: state.device_feature_external_id,
          state: state.state,
        });
      }
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },
  };
}
