// -----------------------------------------------------------------------------
// An in-memory Checkmk REST API, seeded with the real answers of Checkmk
// 2.5.0p16 Community (test/fixtures/checkmk): the hosts and the services that
// are not OK, the credential check, the Livestatus `query` of the services,
// acknowledgements and the real error answers. Tests change its state (host
// states, services, downtimes, failures) between two reads.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const SITE_URL = 'http://192.0.2.10/cmk';
export const API_URL = `${SITE_URL}/check_mk/api/1.0`;
export const USERNAME = 'gladys';
export const SECRET = 'test-secret-0123456789';

export const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/checkmk/checkmk-2.5.0.json', import.meta.url), 'utf8'),
);
const rows = (name) => fixture[name].response.value.map((row) => structuredClone(row.extensions));
const answer = (name) => structuredClone(fixture[name].response);

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export class FakeCheckmk {
  constructor({ version = '2.5.0p16.community' } = {}) {
    this.version = version;
    this.hosts = rows('hosts');
    this.services = rows('services');
    /** 'down' (connection refused), 'stopped' (503), 'redirect', 'wrong_site', or null */
    this.failure = null;
    this.ackStatus = null;
    this.calls = [];
    this.acknowledged = [];
  }

  host(name) {
    return this.hosts.find((host) => host.name === name);
  }

  /** Put a host in a state: 0 UP, 1 DOWN, 2 UNREACH. */
  setHost(name, state, extra = {}) {
    Object.assign(this.host(name), { state, has_been_checked: 1, acknowledged: 0, ...extra });
  }

  /** Put a service in a state (0 removes it from the answers: OK). */
  setService(host, description, state, extra = {}) {
    const existing = this.services.find(
      (service) => service.host_name === host && service.description === description,
    );
    if (state === 0) {
      this.services = this.services.filter((service) => service !== existing);
      return;
    }
    if (existing) {
      Object.assign(existing, { state, ...extra });
      return;
    }
    this.services.push({
      host_name: host,
      description,
      state,
      acknowledged: 0,
      scheduled_downtime_depth: 0,
      last_state_change: 1792480000,
      plugin_output: `${description} is ${state}`,
      ...extra,
    });
  }

  /** The network seam of the client (src/checkmk/http.js). */
  async request(url, { method = 'GET', body, headers = {} }) {
    if (this.failure === 'down') {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (this.failure === 'stopped') {
      return { status: 503, headers: {}, body: '<html>Service Unavailable</html>' };
    }
    if (this.failure === 'redirect') {
      return { status: 302, headers: { location: url.replace('http:', 'https:') }, body: '' };
    }
    const target = new URL(url);
    if (this.failure === 'wrong_site' || !url.startsWith(API_URL)) {
      return {
        status: 404,
        headers: { 'content-type': 'text/html' },
        body: '<html>Not Found</html>',
      };
    }
    const path = target.pathname.slice(new URL(API_URL).pathname.length);
    this.calls.push({ method, path, params: [...target.searchParams] });
    const credentials = headers.authorization?.replace(/^Bearer /, '');
    if (credentials === undefined) {
      return json(401, answer('no_credentials'));
    }
    if (credentials !== `${USERNAME} ${SECRET}`) {
      return json(401, answer('bad_credentials'));
    }
    const columns = target.searchParams.getAll('columns');
    const pickColumns = (row) => Object.fromEntries(columns.map((column) => [column, row[column]]));
    const collection = (domainType, list) =>
      json(200, {
        id: domainType,
        domainType,
        value: list.map((row) => ({
          domainType: 'dict',
          id: row.name ?? `${row.host_name}:${row.description}`,
          extensions: pickColumns(row),
        })),
      });

    if (method === 'GET' && path === '/version') {
      const version = answer('version');
      version.versions.checkmk = this.version;
      return json(200, version);
    }
    if (method === 'GET' && path === '/domain-types/host/collections/all') {
      return collection('host', this.hosts);
    }
    if (method === 'GET' && path === '/domain-types/service/collections/all') {
      const query = JSON.parse(target.searchParams.get('query') ?? 'null');
      const list = query
        ? this.services.filter((service) => service[query.left] !== Number(query.right))
        : this.services;
      return collection('service', list);
    }
    if (method === 'POST' && path.startsWith('/domain-types/acknowledge/collections/')) {
      const request = JSON.parse(body);
      if (this.ackStatus) {
        return json(this.ackStatus, {
          title: 'Forbidden',
          status: this.ackStatus,
          detail: 'You lack the permission.',
        });
      }
      this.acknowledged.push(request);
      if (request.acknowledge_type === 'host') {
        const host = this.host(request.host_name);
        if (!host || host.state === 0) {
          return json(422, answer('acknowledge_host_without_problem'));
        }
        host.acknowledged = 1;
      } else {
        const service = this.services.find(
          (entry) =>
            entry.host_name === request.host_name &&
            entry.description === request.service_description,
        );
        if (!service) {
          return json(400, answer('acknowledge_service_ok'));
        }
        service.acknowledged = 1;
      }
      return { status: 204, headers: {}, body: '' };
    }
    return json(404, { title: 'Not Found', status: 404, detail: `No route ${method} ${path}` });
  }
}
