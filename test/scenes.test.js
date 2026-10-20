import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, createWorld, hostDevice } from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

test('acknowledge_host_problems acknowledges the host and its services, with a comment', async (t) => {
  const w = await world(t);
  const device = hostDevice(w.gladys, 'behindhost');
  const ack = await w.fake.sceneAction('acknowledge_host_problems', { device, message: ' Seen ' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { acknowledged: 2 });
  assert.deepEqual(
    w.checkmk.acknowledged.map((entry) => [
      entry.acknowledge_type,
      entry.host_name,
      entry.service_description,
      entry.comment,
    ]),
    [
      ['host', 'behindhost', undefined, 'Seen'],
      ['service', 'behindhost', 'PING', 'Seen'],
    ],
  );
  // Read again at once: nothing left to acknowledge.
  const again = await w.fake.sceneAction('acknowledge_host_problems', { device });
  assert.deepEqual(again.data.outputs, { acknowledged: 0 });
});

test('acknowledge_host_problems: services only on a host UP, the default comment in its language', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'localhost'),
  });
  // Disk space was already acknowledged.
  assert.deepEqual(ack.data.outputs, { acknowledged: 2 });
  assert.deepEqual(
    w.checkmk.acknowledged.map((entry) => [entry.service_description, entry.comment]),
    [
      ['Check_MK Discovery', 'Acquitté depuis Gladys'],
      ['Gladys_test', 'Acquitté depuis Gladys'],
    ],
  );
});

test('acknowledge_host_problems: a problem gone meanwhile is skipped', async (t) => {
  const w = await world(t);
  // Checkmk no longer has the service in problem, the integration does not know yet.
  w.checkmk.setService('localhost', 'Gladys_test', 0);
  const ack = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'localhost'),
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { acknowledged: 1 });
});

test('acknowledge_host_problems: turned off, refused, unknown host', async (t) => {
  const off = await world(t, { config: { ...BASE_CONFIG, allow_acknowledge: false } });
  const disabled = await off.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(off.gladys, 'behindhost'),
  });
  assert.equal(disabled.success, false);
  assert.match(disabled.error, /turned off/);
  assert.deepEqual(off.checkmk.acknowledged, []);

  const w = await world(t);
  w.checkmk.ackStatus = 403;
  const refused = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'behindhost'),
  });
  assert.equal(refused.success, false);
  assert.match(refused.error, /may acknowledge/);
  const unknown = await w.fake.sceneAction('acknowledge_host_problems', { device: 'nope' });
  assert.match(unknown.error, /not a Checkmk host/);
});

test('get_problems: every host, or one, in words', async (t) => {
  const w = await world(t);
  const all = await w.fake.sceneAction('get_problems', {});
  assert.deepEqual(all.data.outputs, {
    count: 6,
    unhandled: 4,
    hosts_down: 2,
    services_crit: 2,
    services_warn: 2,
    services_unknown: 0,
    names:
      'deadhost: DOWN, behindhost: UNREACH, localhost: Gladys_test CRIT, behindhost: PING CRIT, ' +
      'localhost: Disk space WARN, localhost: Check_MK Discovery WARN',
  });

  const one = await w.fake.sceneAction('get_problems', {
    device: hostDevice(w.gladys, 'behindhost'),
  });
  assert.equal(one.data.outputs.count, 2);
  assert.equal(one.data.outputs.names, 'behindhost: UNREACH, behindhost: PING CRIT');
});

test('the scene actions fail clearly while Checkmk does not answer', async (t) => {
  const w = await world(t);
  w.checkmk.failure = 'down';
  w.clock.advance(20_000);
  const ack = await w.fake.sceneAction('get_problems', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /does not answer/);
});
