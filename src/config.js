// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Checkmk site. The address typed by the user can be any page of the site
// copied from the browser (`https://monitoring.example.com/mysite/check_mk/
// index.py?…`): the REST API is always `/<site>/check_mk/api/1.0`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  checkmk_url: '',
  username: '',
  secret: '',
  folder: '',
  labels: '',
  poll_interval: '60',
  allow_acknowledge: true,
  allow_self_signed: false,
  language: 'fr',
};

export const MAX_LABELS = 10;

const API_PATH = '/check_mk/api/1.0';

/**
 * Parse the address typed by the user into the base URL of the REST API:
 * the site URL (`http://192.0.2.5/mysite`), a page of the site
 * (`…/mysite/check_mk/dashboard.py`) or the API itself. HTTP by default.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port]/<site>/check_mk/api/1.0`, null when unusable
 */
export function parseApiUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // Everything before /check_mk is the path of the site (a reverse proxy may
  // add a prefix); without it, the whole path.
  const at = url.pathname.search(/\/check_mk(\/|$)/);
  const path = (at >= 0 ? url.pathname.slice(0, at) : url.pathname).replace(/\/+$/, '');
  // Checkmk always serves a site under its name: no path, no API.
  if (!path) {
    return null;
  }
  return `${url.origin}${path}${API_PATH}`;
}

/** The address shown to the user: host and site, without scheme nor API path. */
export const siteOf = (apiUrl) =>
  apiUrl.replace(/^https?:\/\//, '').replace(new RegExp(`${API_PATH}$`), '');

/** `homelab`, `/homelab/`, `~homelab~linux` → `/homelab`, `/homelab/linux`; '' for all. */
export function parseFolder(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const path = raw
    .trim()
    .replace(/~/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  return path ? `/${path}` : '';
}

/**
 * Host labels, separated by commas, `;` or new lines: `key:value` (that
 * value) or `key` (any value).
 * @returns {Array<{ key: string, value: string|null }>}
 */
export function parseLabels(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const labels = [];
  for (const entry of raw.split(/[\n,;]/)) {
    const text = entry.trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    const at = text.indexOf(':');
    if (at < 0) {
      labels.push({ key: text, value: null });
    } else if (at > 0) {
      // `key:` alone: any value, as `key`.
      labels.push({ key: text.slice(0, at).trim(), value: text.slice(at + 1).trim() || null });
    }
  }
  return labels.filter((label) => label.key).slice(0, MAX_LABELS);
}

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('checkmk_url');
  const apiUrl = parseApiUrl(typed);
  return {
    apiUrl,
    invalidUrl: Boolean(typed) && !apiUrl,
    username: text('username'),
    // A pasted secret often carries a trailing space or new line.
    secret: text('secret'),
    folder: parseFolder(source.folder),
    labels: parseLabels(source.labels),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    allowAcknowledge:
      source.allow_acknowledge === undefined || source.allow_acknowledge === null
        ? DEFAULT_CONFIG.allow_acknowledge
        : isTrue(source.allow_acknowledge),
    allowSelfSigned: isTrue(source.allow_self_signed),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
