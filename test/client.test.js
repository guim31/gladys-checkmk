// The REST API client against the fake Checkmk (real 2.5.0p16 answers): the
// snapshot, the scope (folder, labels), the errors, and acknowledgements.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckmkClient,
  ERROR_KINDS,
  SERVICE_QUERY,
  folderOf,
  parseVersion,
} from '../src/checkmk/client.js';
import { API_URL, FakeCheckmk, SECRET, USERNAME } from './helpers/fakeCheckmk.js';

const clientFor = (checkmk, options = {}) =>
  new CheckmkClient({
    url: API_URL,
    username: USERNAME,
    secret: SECRET,
    request: (url, request) => checkmk.request(url, request),
    ...options,
  });

async function rejectsWith(promise, kind) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.kind, kind, err.message);
    return true;
  });
}

test('snapshot: version, hosts and the services that are not OK, from the real answers', async () => {
  const checkmk = new FakeCheckmk();
  const snapshot = await clientFor(checkmk).snapshot();
  assert.equal(snapshot.version, '2.5.0p16.community');
  assert.equal(snapshot.site, 'cmk');
  assert.equal(snapshot.edition, 'community');
  assert.equal(snapshot.total, 4);
  assert.deepEqual(
    snapshot.hosts.map((host) => [
      host.name,
      host.state,
      host.acknowledged,
      host.downtime,
      host.folder,
    ]),
    [
      ['outside', 0, false, true, '/'],
      ['localhost', 0, false, false, '/homelab'],
      ['deadhost', 1, true, false, '/homelab'],
      ['behindhost', 2, false, false, '/homelab'],
    ],
  );
  assert.equal(snapshot.hosts[1].labels.room, 'rack');
  assert.deepEqual(
    snapshot.services.find((service) => service.service === 'Gladys_test'),
    {
      host: 'localhost',
      service: 'Gladys_test',
      state: 2,
      acknowledged: false,
      downtime: false,
      since: 1792479678,
      output: 'forced critical for the test',
    },
  );
  assert.equal(snapshot.services.length, 4);
  // The credentials go in the Bearer header, the services query asks for the non-OK ones.
  const services = checkmk.calls.find((call) => call.path.includes('/service/'));
  assert.ok(services.params.some(([key, value]) => key === 'query' && value === SERVICE_QUERY));
  assert.ok(services.params.some(([key, value]) => key === 'columns' && value === 'plugin_output'));
});

test('a service of a host in downtime is in downtime too', async () => {
  const checkmk = new FakeCheckmk();
  checkmk.setService('outside', 'PING', 2);
  const { services } = await clientFor(checkmk).snapshot();
  assert.equal(services.find((service) => service.host === 'outside').downtime, true);
});

test('scope: a folder with its subfolders, labels all required, a host still pending', async () => {
  const checkmk = new FakeCheckmk();
  checkmk.host('outside').has_been_checked = 0;
  const client = clientFor(checkmk);
  let snapshot = await client.snapshot({ folder: '/Homelab' });
  assert.deepEqual(
    snapshot.hosts.map((host) => host.name),
    ['localhost', 'deadhost', 'behindhost'],
  );
  assert.equal(snapshot.total, 4);
  snapshot = await client.snapshot({
    labels: [
      { key: 'room', value: 'rack' },
      { key: 'cmk/os_family', value: null },
    ],
  });
  assert.deepEqual(
    snapshot.hosts.map((host) => host.name),
    ['localhost'],
  );
  // Only the services of the hosts in scope.
  assert.deepEqual([...new Set(snapshot.services.map((service) => service.host))], ['localhost']);
  snapshot = await client.snapshot({ folder: '/' });
  assert.equal(snapshot.hosts[0].state, null);
  assert.equal(snapshot.hosts.length, 4);
});

test('folderOf reads the Setup folder of a Livestatus filename', () => {
  assert.equal(folderOf('/wato/hosts.mk'), '/');
  assert.equal(folderOf('/wato/homelab/linux/hosts.mk'), '/homelab/linux');
  assert.equal(folderOf(''), null);
  assert.equal(folderOf(undefined), null);
});

test('errors: credentials refused, missing, no site, no host, stopped, redirect, old version', async () => {
  const checkmk = new FakeCheckmk();
  await rejectsWith(clientFor(checkmk, { secret: 'wrong' }).snapshot(), ERROR_KINDS.AUTH);
  await rejectsWith(
    clientFor(checkmk, { username: '' }).snapshot(),
    ERROR_KINDS.CREDENTIALS_MISSING,
  );
  await rejectsWith(
    clientFor(checkmk, { url: 'http://192.0.2.10/nosite/check_mk/api/1.0' }).snapshot(),
    ERROR_KINDS.NOT_CHECKMK,
  );
  // The monitoring core stopped: 200 and no host (seen on 2.5.0p16).
  const hosts = checkmk.hosts;
  checkmk.hosts = [];
  await rejectsWith(clientFor(checkmk).snapshot(), ERROR_KINDS.NO_HOSTS);
  checkmk.hosts = hosts;
  checkmk.failure = 'stopped';
  await rejectsWith(clientFor(checkmk).snapshot(), ERROR_KINDS.UNREACHABLE);
  checkmk.failure = 'down';
  await rejectsWith(clientFor(checkmk).snapshot(), ERROR_KINDS.UNREACHABLE);
  checkmk.failure = 'redirect';
  await rejectsWith(clientFor(checkmk).snapshot(), ERROR_KINDS.REDIRECT);
  checkmk.failure = null;
  checkmk.version = '2.1.0p40.cre';
  await rejectsWith(clientFor(checkmk).snapshot(), ERROR_KINDS.VERSION);
  await rejectsWith(
    clientFor(checkmk, {
      request: async () => {
        throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
      },
    }).snapshot(),
    ERROR_KINDS.TLS,
  );
});

test('the version is read once, until reset()', async () => {
  const checkmk = new FakeCheckmk();
  const client = clientFor(checkmk);
  await client.snapshot();
  await client.snapshot();
  assert.equal(checkmk.calls.filter((call) => call.path === '/version').length, 1);
  client.reset();
  await client.snapshot();
  assert.equal(checkmk.calls.filter((call) => call.path === '/version').length, 2);
  assert.deepEqual(parseVersion('2.5.0p16.community'), [2, 5]);
  assert.equal(parseVersion('daily'), null);
});

test('acknowledge: a host down, a service; Checkmk refuses a problem that is gone', async () => {
  const checkmk = new FakeCheckmk();
  const client = clientFor(checkmk);
  assert.equal(await client.acknowledgeHost('behindhost', 'seen'), null);
  assert.equal(await client.acknowledgeService('localhost', 'Gladys_test', 'seen'), null);
  assert.deepEqual(checkmk.acknowledged[1], {
    acknowledge_type: 'service',
    host_name: 'localhost',
    service_description: 'Gladys_test',
    sticky: true,
    persistent: false,
    notify: false,
    comment: 'seen',
  });
  await assert.rejects(client.acknowledgeHost('localhost', 'x'), (err) => {
    assert.equal(err.kind, ERROR_KINDS.API);
    assert.equal(err.status, 422);
    return true;
  });
  await assert.rejects(client.acknowledgeService('localhost', 'PING', 'x'), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});
