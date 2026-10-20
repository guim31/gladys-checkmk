// -----------------------------------------------------------------------------
// Checkmk REST API client (`/<site>/check_mk/api/1.0`), with an automation
// user: `Authorization: Bearer <user> <secret>`.
//
// One read (snapshot) = three GET requests: `version` (once an hour), the
// hosts and the services that are not OK, both through the Livestatus views
// of the API (`domain-types/<host|service>/collections/all` with `columns`
// and a `query`). Acknowledgements are POSTs, one per host or service.
//
// Errors are thrown as CheckmkError with a `kind` (ERROR_KINDS): the hub and
// the texts know what to tell the user from it.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer, timeout, 502/503/504 (a stopped site answers 503)
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // user or secret refused (401)
  CREDENTIALS_MISSING: 'credentials_missing', // no user or secret in the configuration
  NOT_CHECKMK: 'not_checkmk', // something answers, but not the REST API of a site
  REDIRECT: 'redirect', // HTTP redirected to HTTPS: the address must say https://
  VERSION: 'version', // Checkmk older than 2.2
  NO_HOSTS: 'no_hosts', // no host visible: core stopped, or a user without contact group
  API: 'api', // the API refused a request (permissions, parameters)
  HTTP: 'http', // anything else
});

export class CheckmkError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message for the logs (never a secret)
   * @param {object} [extra] e.g. { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CheckmkError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MIN_VERSION = [2, 2];

// Livestatus columns read on every cycle.
export const HOST_COLUMNS = [
  'name',
  'alias',
  'state',
  'has_been_checked',
  'acknowledged',
  'scheduled_downtime_depth',
  'labels',
  'filename',
  'last_state_change',
];
export const SERVICE_COLUMNS = [
  'host_name',
  'description',
  'state',
  'acknowledged',
  'scheduled_downtime_depth',
  'last_state_change',
  'plugin_output',
];
// Only the services that are not OK: on a real site, most services are.
export const SERVICE_QUERY = JSON.stringify({ op: '!=', left: 'state', right: '0' });

/** "2.5.0p16.community" → [2, 5]; null when not a version. */
export function parseVersion(text) {
  const match = typeof text === 'string' ? text.match(/^(\d+)\.(\d+)/) : null;
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const atLeast = ([major, minor], [wantMajor, wantMinor]) =>
  major > wantMajor || (major === wantMajor && minor >= wantMinor);

/**
 * The Setup folder of a host from its Livestatus `filename`:
 * `/wato/homelab/linux/hosts.mk` → `/homelab/linux`, `/wato/hosts.mk` → `/`,
 * null for a host not managed in Setup.
 */
export function folderOf(filename) {
  const match = typeof filename === 'string' ? filename.match(/^\/wato(\/.*)?\/hosts\.mk$/) : null;
  if (!match) {
    return null;
  }
  return match[1] || '/';
}

/**
 * Whether a host is in the scope of the configuration: in the folder (or one
 * of its subfolders) and carrying every label (`key` alone: any value).
 * Folders compare without case: Setup shows titles, the path holds names.
 */
export function inScope(host, { folder = '', labels = [] } = {}) {
  if (folder && folder !== '/') {
    const path = (host.folder ?? '').toLowerCase();
    const wanted = folder.toLowerCase();
    if (path !== wanted && !path.startsWith(`${wanted}/`)) {
      return false;
    }
  }
  return labels.every(({ key, value }) =>
    value === null ? key in host.labels : host.labels[key] === value,
  );
}

export class CheckmkClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the REST API (…/check_mk/api/1.0)
   * @param {string} [options.username] automation user
   * @param {string} [options.secret] its automation secret
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    username = '',
    secret = '',
    insecure = false,
    request = httpRequest,
    timeoutMs = 15_000,
  }) {
    this.url = url;
    this.username = username;
    this.secret = secret;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.info = null;
  }

  /** Forget the version: read again before the next request (Checkmk upgraded). */
  reset() {
    this.info = null;
  }

  /**
   * One request to the REST API.
   * @param {string} path after the API base, e.g. `/version`
   * @param {{ method?: string, params?: Array<[string, string]>, body?: object }} [options]
   * @returns {Promise<object|null>} the parsed answer, null for 204
   * @throws {CheckmkError}
   */
  async call(path, { method = 'GET', params = [], body } = {}) {
    if (!this.username || !this.secret) {
      throw new CheckmkError(ERROR_KINDS.CREDENTIALS_MISSING, 'No user or secret configured');
    }
    const query = new URLSearchParams(params).toString();
    const headers = {
      authorization: `Bearer ${this.username} ${this.secret}`,
      accept: 'application/json',
    };
    if (body) {
      headers['content-type'] = 'application/json';
    }
    let response;
    try {
      response = await this.request(`${this.url}${path}${query ? `?${query}` : ''}`, {
        method,
        body: body ? JSON.stringify(body) : '',
        headers,
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new CheckmkError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      if (!err.code) {
        // The server answers, but not as expected (an answer too large…).
        throw new CheckmkError(ERROR_KINDS.HTTP, err.message);
      }
      throw new CheckmkError(ERROR_KINDS.UNREACHABLE, `${err.code}`);
    }

    const { status } = response;
    if (status === 204) {
      return null;
    }
    if (status >= 300 && status < 400) {
      throw new CheckmkError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if ([502, 503, 504].includes(status)) {
      // A stopped site, or a reverse proxy in front of it.
      throw new CheckmkError(ERROR_KINDS.UNREACHABLE, `HTTP ${status}`, { status });
    }
    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      // A wrong site name: Apache answers 404 in HTML.
      throw new CheckmkError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_CHECKMK : ERROR_KINDS.HTTP,
        `Not a Checkmk REST API answer (HTTP ${status})`,
        { status },
      );
    }
    if (status === 401) {
      throw new CheckmkError(ERROR_KINDS.AUTH, `Refused (HTTP 401): ${parsed.detail ?? ''}`, {
        status,
      });
    }
    if (status >= 400) {
      const detail = [parsed.title, parsed.detail].filter(Boolean).join(': ');
      throw new CheckmkError(ERROR_KINDS.API, `${method} ${path}: ${detail} (HTTP ${status})`, {
        status,
      });
    }
    return parsed;
  }

  /** Read the version once (again after reset()). */
  async detect() {
    if (this.info) {
      return this.info;
    }
    const answer = await this.call('/version');
    const version = answer?.versions?.checkmk;
    const parsed = parseVersion(version);
    if (!parsed || typeof answer.site !== 'string') {
      throw new CheckmkError(ERROR_KINDS.NOT_CHECKMK, `Unexpected version answer`);
    }
    if (!atLeast(parsed, MIN_VERSION)) {
      throw new CheckmkError(ERROR_KINDS.VERSION, `Checkmk ${version} is older than 2.2`, {
        version,
      });
    }
    this.info = { version, site: answer.site, edition: answer.edition ?? '' };
    return this.info;
  }

  /** A Livestatus view of the API: the `extensions` of every row. */
  async rows(table, columns, query) {
    const params = columns.map((column) => ['columns', column]);
    if (query) {
      params.unshift(['query', query]);
    }
    const answer = await this.call(`/domain-types/${table}/collections/all`, { params });
    if (!Array.isArray(answer?.value)) {
      throw new CheckmkError(ERROR_KINDS.HTTP, `Unexpected ${table} answer`);
    }
    return answer.value.map((row) => row.extensions ?? {});
  }

  /**
   * Everything one cycle needs, in the scope of the configuration.
   * @param {{ folder?: string, labels?: Array<{ key: string, value: string|null }> }} [scope]
   * @returns {Promise<{ version: string, site: string, edition: string, hosts: object[], services: object[], total: number }>}
   * @throws {CheckmkError}
   */
  async snapshot(scope = {}) {
    const info = await this.detect();
    const rawHosts = await this.rows('host', HOST_COLUMNS);
    const all = rawHosts
      .filter((host) => typeof host.name === 'string' && host.name)
      .map((host) => ({
        name: host.name,
        alias: typeof host.alias === 'string' && host.alias ? host.alias : host.name,
        // 0 UP, 1 DOWN, 2 UNREACH; null until checked once (PENDING).
        state: Number(host.has_been_checked) === 1 ? Math.min(2, Number(host.state) || 0) : null,
        acknowledged: Number(host.acknowledged) === 1,
        downtime: Number(host.scheduled_downtime_depth) > 0,
        since: Number(host.last_state_change) || 0,
        folder: folderOf(host.filename),
        labels: host.labels && typeof host.labels === 'object' ? host.labels : {},
      }));
    // With its monitoring core stopped, a site answers 200 and no host: taken
    // as is, every problem would end, then start again with the core.
    if (all.length === 0) {
      throw new CheckmkError(ERROR_KINDS.NO_HOSTS, 'No host visible to the automation user');
    }
    const hosts = all.filter((host) => inScope(host, scope));
    const byName = new Map(hosts.map((host) => [host.name, host]));

    const rawServices = await this.rows('service', SERVICE_COLUMNS, SERVICE_QUERY);
    const services = rawServices
      .filter((service) => byName.has(service.host_name) && Number(service.state) > 0)
      .map((service) => ({
        host: service.host_name,
        service: String(service.description ?? ''),
        // 1 WARN, 2 CRIT, 3 UNKNOWN.
        state: Math.min(3, Number(service.state)),
        acknowledged: Number(service.acknowledged) === 1,
        // A downtime of the service or of its host: Checkmk does not notify.
        downtime:
          Number(service.scheduled_downtime_depth) > 0 || byName.get(service.host_name).downtime,
        since: Number(service.last_state_change) || 0,
        output: String(service.plugin_output ?? ''),
      }));
    return { ...info, hosts, services, total: all.length };
  }

  /**
   * Acknowledge the problem of a host (sticky: until it is UP again).
   * Checkmk answers 422 when the host has no problem.
   */
  acknowledgeHost(host, comment) {
    return this.call('/domain-types/acknowledge/collections/host', {
      method: 'POST',
      body: {
        acknowledge_type: 'host',
        host_name: host,
        sticky: true,
        persistent: false,
        notify: false,
        comment,
      },
    });
  }

  /**
   * Acknowledge the problem of a service (sticky: until it is OK again).
   * Checkmk answers 400 "Service not found" when the service is OK.
   */
  acknowledgeService(host, service, comment) {
    return this.call('/domain-types/acknowledge/collections/service', {
      method: 'POST',
      body: {
        acknowledge_type: 'service',
        host_name: host,
        service_description: service,
        sticky: true,
        persistent: false,
        notify: false,
        comment,
      },
    });
  }
}
