import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_MODES, TuyaApiError, UltenicClient } from '../src/ultenic/client.js';
import { computeSignature } from '../src/ultenic/signature.js';
import { tuyaVacuumDevice } from './helpers/tuyaFixtures.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Install a fetch stub driven by a list of handlers matched on the URL.
 * @param {Array<{ match: RegExp, respond: (request: object) => object }>} handlers the handlers
 * @returns {Array<object>} the recorded requests
 */
function stubFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const request = { url, ...options };
    calls.push(request);
    const handler = handlers.find((candidate) => candidate.match.test(url));
    if (!handler) {
      throw new Error(`Unexpected call to ${url}`);
    }
    const payload = handler.respond(request);
    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
    };
  };
  return calls;
}

const TOKEN_RESPONSE = {
  success: true,
  result: {
    access_token: 'token-1',
    refresh_token: 'refresh-1',
    expire_time: 7200,
    uid: 'eu1700000000',
  },
};

/**
 * @returns {UltenicClient} a client wired on the European data center
 */
function createClient() {
  return new UltenicClient({
    region: 'eu',
    accessId: 'access-id',
    accessSecret: 'access-secret',
  });
}

test('the first business call fetches a token, then reuses it', async () => {
  const calls = stubFetch([
    { match: /\/v1\.0\/token\?grant_type=1$/, respond: () => TOKEN_RESPONSE },
    {
      match: /\/status$/,
      respond: () => ({ success: true, result: [{ code: 'status', value: 'charging' }] }),
    },
  ]);

  const client = createClient();
  await client.getStatus('device-1');
  await client.getStatus('device-1');

  assert.equal(calls.filter((call) => call.url.includes('/token')).length, 1);
  assert.equal(calls.length, 3);
});

test('requests are signed exactly the way Tuya expects', async () => {
  const calls = stubFetch([
    { match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE },
    { match: /\/status$/, respond: () => ({ success: true, result: [] }) },
  ]);

  await createClient().getStatus('device-1');

  const [tokenCall, statusCall] = calls;
  assert.equal(tokenCall.headers.client_id, 'access-id');
  assert.equal(tokenCall.headers.sign_method, 'HMAC-SHA256');
  // The token endpoint carries no access_token header, business calls do.
  assert.equal(tokenCall.headers.access_token, undefined);
  assert.equal(statusCall.headers.access_token, 'token-1');
  assert.equal(
    statusCall.headers.sign,
    computeSignature({
      accessId: 'access-id',
      accessSecret: 'access-secret',
      timestamp: statusCall.headers.t,
      accessToken: 'token-1',
      method: 'GET',
      signedPath: '/v1.0/devices/device-1/status',
    }),
  );
});

test('a rejected token is renewed and the call retried once', async () => {
  let statusCalls = 0;
  const calls = stubFetch([
    {
      match: /\/v1\.0\/token\/refresh-1$/,
      respond: () => ({
        success: true,
        result: { access_token: 'token-2', refresh_token: 'refresh-2', expire_time: 7200 },
      }),
    },
    { match: /\/v1\.0\/token\?grant_type=1$/, respond: () => TOKEN_RESPONSE },
    {
      match: /\/status$/,
      respond: () => {
        statusCalls += 1;
        return statusCalls === 1
          ? { success: false, code: 1010, msg: 'token is expired' }
          : { success: true, result: [{ code: 'status', value: 'standby' }] };
      },
    },
  ]);

  const result = await createClient().getStatus('device-1');

  assert.deepEqual(result, [{ code: 'status', value: 'standby' }]);
  assert.equal(statusCalls, 2);
  assert.ok(calls.some((call) => call.url.includes('/v1.0/token/refresh-1')));
  // The retry uses the renewed token.
  assert.equal(calls.at(-1).headers.access_token, 'token-2');
});

test('a business error is surfaced with its Tuya code, without retrying', async () => {
  let statusCalls = 0;
  stubFetch([
    { match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE },
    {
      match: /\/status$/,
      respond: () => {
        statusCalls += 1;
        return { success: false, code: 1106, msg: 'permission deny' };
      },
    },
  ]);

  await assert.rejects(
    () => createClient().getStatus('device-1'),
    (err) => {
      assert.ok(err instanceof TuyaApiError);
      assert.equal(err.code, 1106);
      assert.match(err.message, /permission deny/);
      return true;
    },
  );
  assert.equal(statusCalls, 1, 'a permission error is not a token error: no retry');
});

test('listVacuums keeps only the robot vacuums and follows the pagination', async () => {
  const pages = [
    {
      success: true,
      result: {
        has_more: true,
        last_row_key: 'cursor-2',
        devices: [tuyaVacuumDevice(), { id: 'plug-1', category: 'cz', name: 'Plug' }],
      },
    },
    {
      success: true,
      result: {
        has_more: false,
        devices: [tuyaVacuumDevice({ id: 'vacuum-2', name: 'Ultenic D5s' })],
      },
    },
  ];
  let page = 0;
  const calls = stubFetch([
    { match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE },
    {
      match: /associated-users\/devices/,
      respond: () => {
        const response = pages[page];
        page += 1;
        return response;
      },
    },
  ]);

  const vacuums = await createClient().listVacuums();

  assert.deepEqual(
    vacuums.map((device) => device.id),
    ['bf1234567890abcdef', 'vacuum-2'],
  );
  const listCalls = calls.filter((call) => call.url.includes('associated-users'));
  assert.equal(listCalls.length, 2);
  assert.match(listCalls[1].url, /last_row_key=cursor-2/);
});

test('a configured UID switches to the per-user listing endpoint', async () => {
  const calls = stubFetch([
    { match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE },
    {
      match: /\/v1\.0\/users\/eu42\/devices$/,
      respond: () => ({ success: true, result: [tuyaVacuumDevice()] }),
    },
  ]);

  const client = new UltenicClient({
    region: 'eu',
    accessId: 'access-id',
    accessSecret: 'access-secret',
    userUid: 'eu42',
  });
  const vacuums = await client.listVacuums();

  assert.equal(vacuums.length, 1);
  assert.ok(calls.some((call) => call.url.endsWith('/v1.0/users/eu42/devices')));
});

test('sendCommands posts the exact body it signed', async () => {
  const calls = stubFetch([
    { match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE },
    { match: /\/commands$/, respond: () => ({ success: true, result: true }) },
  ]);

  await createClient().sendCommands('device-1', [{ code: 'power_go', value: true }]);

  const commandCall = calls.at(-1);
  assert.equal(commandCall.method, 'POST');
  assert.equal(commandCall.headers['Content-Type'], 'application/json');
  assert.equal(commandCall.body, '{"commands":[{"code":"power_go","value":true}]}');
  assert.equal(
    commandCall.headers.sign,
    computeSignature({
      accessId: 'access-id',
      accessSecret: 'access-secret',
      timestamp: commandCall.headers.t,
      accessToken: 'token-1',
      method: 'POST',
      signedPath: '/v1.0/devices/device-1/commands',
      body: commandCall.body,
    }),
  );
});

/**
 * @returns {UltenicClient} a client authenticating as an app user
 */
function createUserCredentialsClient() {
  return new UltenicClient({
    region: 'eu',
    accessId: 'access-id',
    accessSecret: 'access-secret',
    authMode: AUTH_MODES.USER_CREDENTIALS,
    appSchema: 'smartlife',
    appUsername: 'me@example.com',
    appPassword: 'hunter2',
    countryCode: '33',
  });
}

test('the app account mode logs in instead of asking for a project token', async () => {
  const calls = stubFetch([
    {
      match: /associated-users\/actions\/authorized-login$/,
      respond: () => ({
        success: true,
        result: {
          access_token: 'user-token',
          refresh_token: 'user-refresh',
          expire_time: 7200,
          uid: 'eu1699999999',
        },
      }),
    },
    {
      match: /\/v1\.0\/users\/eu1699999999\/devices$/,
      respond: () => ({ success: true, result: [tuyaVacuumDevice()] }),
    },
  ]);

  const vacuums = await createUserCredentialsClient().listVacuums();

  assert.equal(vacuums.length, 1);
  const loginCall = calls[0];
  assert.equal(loginCall.method, 'POST');
  // The password is md5-hashed on the wire, never sent in clear.
  assert.deepEqual(JSON.parse(loginCall.body), {
    username: 'me@example.com',
    password: '2ab96390c7dbe3439de74d0c9b0b1767',
    country_code: '33',
    schema: 'smartlife',
  });
  // The login is signed WITHOUT an access token, like the other token endpoint.
  assert.equal(loginCall.headers.access_token, undefined);
  assert.equal(
    loginCall.headers.sign,
    computeSignature({
      accessId: 'access-id',
      accessSecret: 'access-secret',
      timestamp: loginCall.headers.t,
      method: 'POST',
      signedPath: '/v1.0/iot-01/associated-users/actions/authorized-login',
      body: loginCall.body,
    }),
  );
  // No QR code was ever involved, so there is no "linked account" listing:
  // the devices come from the UID the login returned.
  assert.ok(!calls.some((call) => call.url.includes('associated-users/devices')));
});

test('the app account mode refuses to call the cloud with half a login', async () => {
  const client = new UltenicClient({
    region: 'eu',
    accessId: 'access-id',
    accessSecret: 'access-secret',
    authMode: AUTH_MODES.USER_CREDENTIALS,
    appSchema: 'smartlife',
    appUsername: 'me@example.com',
  });
  globalThis.fetch = async () => {
    throw new Error('should not be called');
  };
  await assert.rejects(() => client.listVacuums(), /Missing app account, password or app schema/);
});

test('an explicit UID still wins in app account mode', async () => {
  const calls = stubFetch([
    {
      match: /authorized-login$/,
      respond: () => ({
        success: true,
        result: { access_token: 't', refresh_token: 'r', expire_time: 7200, uid: 'from-token' },
      }),
    },
    {
      match: /\/v1\.0\/users\/chosen-uid\/devices$/,
      respond: () => ({ success: true, result: [] }),
    },
  ]);

  const client = new UltenicClient({
    region: 'eu',
    accessId: 'access-id',
    accessSecret: 'access-secret',
    authMode: AUTH_MODES.USER_CREDENTIALS,
    appSchema: 'smartlife',
    appUsername: 'me@example.com',
    appPassword: 'hunter2',
    userUid: 'chosen-uid',
  });
  await client.listVacuums();

  assert.ok(calls.some((call) => call.url.endsWith('/v1.0/users/chosen-uid/devices')));
});

test('an HTTP error is reported as such', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 502 });
  await assert.rejects(() => createClient().getStatus('device-1'), /Tuya HTTP 502/);
});

test('the data center drives the base URL', async () => {
  const calls = stubFetch([{ match: /\/v1\.0\/token/, respond: () => TOKEN_RESPONSE }]);
  const client = new UltenicClient({ region: 'us', accessId: 'a', accessSecret: 'b' });
  await client.fetchToken();
  assert.match(calls[0].url, /^https:\/\/openapi\.tuyaus\.com\//);
});
