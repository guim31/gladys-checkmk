import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_ROWS } from '../src/widgets.js';
import { createWorld, hostDevice } from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('problems', { settings, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], 'within the core budget');
  return ack.data.content;
}

const status = (body) => body.components.find((component) => component.type === 'status');

test('the widget: tiles, hosts down first, then services CRIT, a Refresh button', async (t) => {
  const w = await world(t);
  const body = await content(w);
  const values = body.components.filter((component) => component.type === 'value');
  assert.deepEqual(
    values.map((value) => [value.label, value.value, value.color]),
    [
      ['Hosts down', 2, 'danger'],
      ['Services CRIT', 2, 'danger'],
      ['Unhandled', 4, 'warning'],
    ],
  );
  const rows = status(body).items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.color]),
    [
      ['Host DOWN', 'deadhost ✓', 'danger'],
      ['Host UNREACH', 'behindhost', 'danger'],
      ['Gladys_test CRIT', 'localhost', 'danger'],
      ['PING CRIT', 'behindhost', 'danger'],
      ['Disk space WARN', 'localhost ✓', 'warning'],
      ['Check_MK Discovery WARN', 'localhost', 'warning'],
    ],
  );
  assert.equal(body.components.at(-1).action.key, 'refresh');
});

test('the widget: chosen hosts, all clear, many problems, downtime mark', async (t) => {
  const w = await world(t);
  const one = await content(w, { hosts: [hostDevice(w.gladys, 'localhost')] });
  assert.equal(status(one).items.length, 3);
  for (let index = 0; index < 15; index += 1) {
    w.checkmk.setService('outside', `Service ${index}`, 1);
  }
  await w.hub.pollAll();
  const many = status(await content(w)).items;
  assert.equal(many.length, MAX_ROWS);
  assert.equal(many.at(-1).value, '+12');
  assert.ok(many.every((row) => row.label.length <= 40 && row.value.length <= 40));
  const outside = status(await content(w, { hosts: [hostDevice(w.gladys, 'outside')] })).items;
  assert.equal(outside[0].value, 'outside ⏸', 'a service of a host in downtime');
  const gone = await content(w, { hosts: ['ext:test-integration:host:nope'] });
  assert.equal(status(gone).items[0].value, '0 hosts', 'a host gone shows nothing, not all');
  w.checkmk.services = [];
  for (const host of w.checkmk.hosts) {
    host.state = 0;
  }
  await w.hub.pollAll();
  const clear = await content(w, {}, 'fr');
  assert.deepEqual(status(clear).items, [
    { label: 'Aucun problème', value: '4 hôtes', icon: 'check-circle', color: 'success' },
  ]);
});

test('the widget says what is wrong: not configured, Checkmk silent', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const w = await world(t);
  w.checkmk.failure = 'down';
  await w.hub.pollAll();
  const body = await content(w);
  assert.ok(body.components.some((component) => /does not answer/.test(component.text ?? '')));
  const refresh = await w.fake.widgetAction('problems', 'refresh', {});
  assert.equal(refresh.success, true);
});
