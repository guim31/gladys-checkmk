import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_LABELS,
  normalizeConfig,
  parseApiUrl,
  parseFolder,
  parseLabels,
  siteOf,
} from '../src/config.js';

test('the address of the site, or any page of it, gives the REST API URL', () => {
  const api = 'http://192.0.2.5/mysite/check_mk/api/1.0';
  const cases = {
    '192.0.2.5/mysite': api,
    'http://192.0.2.5/mysite/': api,
    'http://192.0.2.5/mysite/check_mk/': api,
    'http://192.0.2.5/mysite/check_mk/index.py?start_url=%2Fmysite%2Fcheck_mk%2Fdashboard.py': api,
    'http://192.0.2.5/mysite/check_mk/api/1.0/': api,
    ' http://192.0.2.5:5000/cmk ': 'http://192.0.2.5:5000/cmk/check_mk/api/1.0',
    'https://monitoring.example.com/proxy/mysite/check_mk/dashboard.py':
      'https://monitoring.example.com/proxy/mysite/check_mk/api/1.0',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(parseApiUrl(typed), expected, typed);
  }
  const bad = [
    '',
    '   ',
    'ftp://192.0.2.5/mysite',
    'http://user:pass@192.0.2.5/mysite',
    'http://',
    // No site name: Checkmk serves nothing at the root.
    'http://192.0.2.5',
    'http://192.0.2.5/check_mk/',
    42,
  ];
  for (const typed of bad) {
    assert.equal(parseApiUrl(typed), null, String(typed));
  }
  assert.equal(
    siteOf('https://monitoring.example.com/mysite/check_mk/api/1.0'),
    'monitoring.example.com/mysite',
  );
});

test('a folder is a path; labels are key:value or a key alone', () => {
  assert.equal(parseFolder(' homelab/ '), '/homelab');
  assert.equal(parseFolder('/homelab/linux/'), '/homelab/linux');
  assert.equal(parseFolder('~homelab~linux'), '/homelab/linux');
  assert.equal(parseFolder('/'), '');
  assert.equal(parseFolder(undefined), '');
  assert.deepEqual(parseLabels(' gladys:yes, cmk/os_family : linux ;room,gladys:yes\n'), [
    { key: 'gladys', value: 'yes' },
    { key: 'cmk/os_family', value: 'linux' },
    { key: 'room', value: null },
  ]);
  assert.deepEqual(parseLabels(':x, room:'), [{ key: 'room', value: null }]);
  assert.equal(parseLabels('a,b,c,d,e,f,g,h,i,j,k,l').length, MAX_LABELS);
});

test('normalizeConfig: defaults, an invalid address, booleans as strings', () => {
  const empty = normalizeConfig({});
  assert.equal(empty.apiUrl, null);
  assert.equal(empty.invalidUrl, false);
  assert.equal(empty.pollIntervalMs, 60_000);
  assert.equal(empty.allowAcknowledge, true);
  assert.equal(empty.allowSelfSigned, false);
  assert.equal(empty.language, DEFAULT_CONFIG.language);

  const config = normalizeConfig({
    checkmk_url: 'http://192.0.2.5',
    username: ' gladys ',
    secret: ' abc \n',
    poll_interval: 120,
    allow_acknowledge: 'false',
    allow_self_signed: 'true',
    language: 'xx',
  });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.username, 'gladys');
  assert.equal(config.secret, 'abc');
  assert.equal(config.pollIntervalMs, 120_000);
  assert.equal(config.allowAcknowledge, false);
  assert.equal(config.allowSelfSigned, true);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '15' }).pollIntervalMs, 60_000);
});
