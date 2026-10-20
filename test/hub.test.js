// The hub against the fake Checkmk: discovery, states of the added devices
// only, scene events on hosts and services (kept across a restart, held
// during a downtime), the site unreachable, heartbeat, the reading timer, and
// quiet logs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS } from '../src/hub.js';
import {
  BASE_CONFIG,
  FakeCheckmk,
  SECRET,
  createClock,
  createDevices,
  createWorld,
  hostDevice,
  hostFeature,
  siteFeature,
} from './helpers/world.js';

/** The lines written at `LOG_LEVEL=info` from now on (the SDK logger reads it per line). */
function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function world(t, options = {}) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

const keysOf = (w) => w.fake.sceneEvents.map((event) => event.key);

test('discovery: the site device and one device per host, sorted by name', async (t) => {
  const w = await world(t);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Checkmk', 'behindhost', 'deadhost', 'localhost', 'outside'],
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  // Nothing is published for a device not added: Gladys would drop it.
  assert.equal(w.fake.states.length, 0);
});

test('a folder keeps its hosts, and the site counts them only', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, folder: 'homelab', labels: 'room:rack' } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Checkmk', 'localhost'],
  );
  await createDevices(w);
  assert.equal(w.fake.lastState(siteFeature(w.gladys, FEATURE_KEYS.HOSTS_DOWN)), 0);
  assert.equal(w.fake.lastState(siteFeature(w.gladys, FEATURE_KEYS.CRIT)), 1);
});

test('added devices get every state, then only the changes', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const state = (host, key) => w.fake.lastState(hostFeature(w.gladys, host, key));
  assert.equal(state('localhost', FEATURE_KEYS.UP), 1);
  assert.equal(state('localhost', FEATURE_KEYS.WARN), 2);
  assert.equal(state('localhost', FEATURE_KEYS.CRIT), 1);
  assert.equal(state('localhost', FEATURE_KEYS.UNKNOWN), 0);
  assert.equal(state('localhost', FEATURE_KEYS.UNHANDLED), 2, 'Disk space is acknowledged');
  assert.equal(state('deadhost', FEATURE_KEYS.UP), 0);
  assert.equal(state('deadhost', FEATURE_KEYS.UNHANDLED), 0, 'DOWN, but acknowledged');
  assert.equal(state('behindhost', FEATURE_KEYS.UP), 0, 'UNREACH is not up');
  assert.equal(state('behindhost', FEATURE_KEYS.UNHANDLED), 2);
  assert.equal(state('outside', FEATURE_KEYS.DOWNTIME), 1);
  const site = (key) => w.fake.lastState(siteFeature(w.gladys, key));
  assert.equal(site(FEATURE_KEYS.HOSTS_DOWN), 2);
  assert.equal(site(FEATURE_KEYS.WARN), 2);
  assert.equal(site(FEATURE_KEYS.CRIT), 2);
  assert.equal(site(FEATURE_KEYS.UNHANDLED), 4);

  const before = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before, 'nothing changed, nothing sent');

  w.checkmk.setHost('behindhost', 0);
  w.checkmk.setService('behindhost', 'PING', 0);
  w.checkmk.setService('localhost', 'Gladys_test', 3);
  await w.hub.pollAll();
  assert.equal(state('behindhost', FEATURE_KEYS.UP), 1);
  assert.equal(state('behindhost', FEATURE_KEYS.CRIT), 0);
  assert.equal(state('localhost', FEATURE_KEYS.UNKNOWN), 1);
  assert.equal(site(FEATURE_KEYS.HOSTS_DOWN), 1);
});

test('a host still pending publishes nothing for "up"', async (t) => {
  const checkmk = new FakeCheckmk();
  checkmk.host('localhost').has_been_checked = 0;
  const w = await world(t, { checkmk });
  await createDevices(w);
  assert.equal(w.fake.lastState(hostFeature(w.gladys, 'localhost', FEATURE_KEYS.UP)), undefined);
});

test('a device added later receives everything at once, and the widget is refreshed', async (t) => {
  const w = await world(t);
  const localhost = w.fake.discoveredDevices.find((device) => device.name === 'localhost');
  await w.fake.deviceCreated(localhost);
  assert.equal(w.fake.lastState(hostFeature(w.gladys, 'localhost', FEATURE_KEYS.CRIT)), 1);
  assert.ok(w.fake.widgetRefreshes.includes('problems'));
  // "Update" (onDeviceUpdated) sends everything again too.
  const count = w.fake.states.length;
  await w.fake.deviceUpdated(localhost);
  assert.ok(w.fake.states.length > count);
});

test('scene events: the first read records, then hosts down and up', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, [], 'the problems already there are not announced');

  w.checkmk.setHost('localhost', 1, { last_state_change: 1792480000 });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.HOST_DOWN,
      data: {
        device: hostDevice(w.gladys, 'localhost'),
        host: 'localhost',
        state_name: 'DOWN',
      },
    },
  ]);
  // DOWN to UNREACH: still down, not announced again.
  w.checkmk.setHost('localhost', 2);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 1);

  clock.advance(10 * 60_000);
  w.checkmk.setHost('localhost', 0);
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents.at(-1), {
    key: TRIGGERS.HOST_UP,
    data: { device: hostDevice(w.gladys, 'localhost'), host: 'localhost', duration_minutes: 10 },
  });
  // A host down from the start is announced up when it comes back.
  w.checkmk.setHost('deadhost', 0);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.at(-1).data.host, 'deadhost');
  assert.equal(w.fake.sceneEvents.length, 3);
});

test('scene events: a service enters a problem, worsens, recovers', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.checkmk.setService('localhost', 'Memory', 1, {
    last_state_change: 1792480000,
    plugin_output: 'RAM used: 85%',
  });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.SERVICE_PROBLEM,
      data: {
        device: hostDevice(w.gladys, 'localhost'),
        host: 'localhost',
        service: 'Memory',
        state: 1,
        state_name: 'WARN',
        output: 'RAM used: 85%',
      },
    },
  ]);
  w.checkmk.setService('localhost', 'Memory', 2);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.at(-1).data.state_name, 'CRIT');
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 2, 'unchanged: not again');

  clock.advance(5 * 60_000);
  w.checkmk.setService('localhost', 'Memory', 0);
  // A service of the fixture, CRIT from the start, recovers too.
  w.checkmk.setService('localhost', 'Gladys_test', 0);
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.sceneEvents.slice(2).map((event) => [event.key, event.data.service, event.data.state]),
    [
      [TRIGGERS.SERVICE_RECOVERED, 'Gladys_test', 2],
      [TRIGGERS.SERVICE_RECOVERED, 'Memory', 2],
    ],
  );
  const memory = w.fake.sceneEvents.at(-1).data;
  assert.equal(memory.duration_minutes, 5);
  assert.equal(memory.state_name, 'CRIT');
});

test('a host removed from Checkmk takes its services along, without events', async (t) => {
  const w = await world(t);
  w.checkmk.hosts = w.checkmk.hosts.filter((host) => host.name !== 'behindhost');
  w.checkmk.setService('behindhost', 'PING', 0);
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a downtime holds the events until it ends', async (t) => {
  const w = await world(t);
  // "outside" is in a downtime in the fixture.
  w.checkmk.setService('outside', 'PING', 2);
  w.checkmk.setHost('outside', 1, { scheduled_downtime_depth: 1 });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  w.checkmk.host('outside').scheduled_downtime_depth = 0;
  await w.hub.pollAll();
  assert.deepEqual(keysOf(w), [TRIGGERS.HOST_DOWN, TRIGGERS.SERVICE_PROBLEM]);
  // A problem born and gone in a downtime is never announced.
  w.checkmk.setService('localhost', 'Flapping', 2, { scheduled_downtime_depth: 1 });
  await w.hub.pollAll();
  w.checkmk.setService('localhost', 'Flapping', 0);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 2);
});

test('a restart neither repeats nor misses a change', async (t) => {
  const checkmk = new FakeCheckmk();
  const first = await world(t, { checkmk });
  checkmk.setService('localhost', 'Kept', 2);
  await first.hub.pollAll();
  await first.app.stop();
  assert.equal(first.fake.sceneEvents.length, 1);

  // While the integration was stopped: one problem ends, another one starts.
  checkmk.setService('localhost', 'Kept', 0);
  checkmk.setService('localhost', 'Fresh', 1);
  const second = await world(t, { checkmk, dataDir: first.dataDir });
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => [event.key, event.data.service]),
    [
      [TRIGGERS.SERVICE_PROBLEM, 'Fresh'],
      [TRIGGERS.SERVICE_RECOVERED, 'Kept'],
    ],
  );
});

test('another scope records its problems without announcing them', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, folder: '/homelab' } });
  w.checkmk.setService('outside', 'PING', 2);
  w.checkmk.host('outside').scheduled_downtime_depth = 0;
  await w.fake.configUpdated({ ...BASE_CONFIG, folder: '' });
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('Checkmk silent twice: one scene event, unreachable badges, then back', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.checkmk.failure = 'stopped';
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [], 'one failure is a blip');
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.UNREACHABLE,
      data: { site: '192.0.2.10/cmk', error: 'Checkmk does not answer' },
    },
  ]);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.ok(w.fake.transports.slice(-5).every((entry) => entry.transport === 'unreachable'));
  w.checkmk.failure = null;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.ok(w.fake.transports.slice(-5).every((entry) => entry.transport === 'local'));
});

test('a refused secret is a connection status, not an outage', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, secret: 'wrong' } });
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /secret refused/);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('an unchanged value is sent again after 6 hours', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  await createDevices(w);
  const count = w.fake.states.length;
  clock.advance(6 * 3600_000);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, count * 2);
});

test('the container reads Checkmk on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true });
  const reads = () => w.checkmk.calls.filter((call) => call.path.includes('/service/')).length;
  const first = reads();
  t.mock.timers.tick(60_000);
  await new Promise((resolve) => setImmediate(resolve));
  await w.hub.polling;
  assert.equal(reads(), first + 1);
});

test('a normal cycle writes nothing at the info level; a failure one line each way', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const lines = captureLogs(t);
  w.checkmk.setService('localhost', 'Quiet', 2);
  await w.hub.pollAll();
  w.checkmk.setService('localhost', 'Quiet', 0);
  await w.hub.pollAll();
  await w.hub.rediscover();
  assert.equal(w.fake.sceneEvents.length, 2);
  assert.deepEqual(lines, []);

  w.checkmk.failure = 'down';
  for (let read = 0; read < 4; read += 1) {
    await w.hub.pollAll();
  }
  w.checkmk.failure = null;
  await w.hub.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.ok(
    lines.every((line) => !line.includes(SECRET)),
    'no secret in the logs',
  );
});

test('a burst of new problems is capped per read, the rest follows', async (t) => {
  const w = await world(t);
  for (let index = 0; index < 40; index += 1) {
    w.checkmk.setService('localhost', `Service ${index}`, 2);
  }
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 30);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 40);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 40);
});

test('Gladys refusing the scene events (restarting): sent at a next read, once', async (t) => {
  const w = await world(t);
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  w.gladys.publishSceneEvent = (key, data) =>
    refuse ? Promise.reject(new Error('ECONNREFUSED')) : original(key, data);
  w.checkmk.setHost('localhost', 1);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 0);
  refuse = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(keysOf(w), [TRIGGERS.HOST_DOWN]);
});

test('a new scope during a read: the old read does not prime the new scope', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, folder: '/homelab' } });
  const reading = w.hub.pollAll();
  await w.fake.configUpdated({ ...BASE_CONFIG, folder: '' });
  await reading;
  w.checkmk.host('outside').scheduled_downtime_depth = 0;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(w.fake.discoveredDevices.length, 5);
});

test('no configuration: a clear connection status, no request', async (t) => {
  const w = await world(t, { config: {} });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  assert.equal(w.checkmk.calls.length, 0);
});

test('"Test the connection" sums up the site', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, folder: '/homelab' } });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    '192.0.2.10/cmk: OK, Checkmk 2.5.0p16.community, 3/4 host(s), 2 host(s) down, 4 service problem(s)',
  );
  assert.match(ack.data.message.fr, /^192\.0\.2\.10\/cmk : OK/);
});

test('the core stopped (no host at all): an error, and nothing is taken for resolved', async (t) => {
  const w = await world(t);
  const hosts = w.checkmk.hosts;
  const services = w.checkmk.services;
  w.checkmk.hosts = [];
  w.checkmk.services = [];
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /no host visible/);
  assert.equal(w.fake.discoveredDevices.length, 5, 'the list Gladys has stays');
  w.checkmk.hosts = hosts;
  w.checkmk.services = services;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
});
