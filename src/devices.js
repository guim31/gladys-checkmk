// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds the ones to
// follow, nothing is created on their behalf):
//
//   - one device per Checkmk host (the folder and labels of the
//     configuration, or every host the automation user can see), identity =
//     the Checkmk host name (unique per site, and what every API call takes);
//       up            input/binary, 1 UP, 0 DOWN or UNREACH, nothing published
//                     while the host is PENDING
//       services_*    counter-sensor/integer, services in WARN, CRIT, UNKNOWN
//       unhandled     counter-sensor/integer, problems (host and services)
//                     neither acknowledged nor in a downtime
//       downtime      input/binary, 1 in a scheduled downtime
//   - one "Checkmk" device: the same totals over the hosts in scope, and the
//     hosts DOWN or UNREACH.
//
// Published with should_poll: false: the integration reads Checkmk on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const HOST_TYPE = 'host';
export const SITE_TYPE = 'site';
export const SITE_ID = 'main';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  UP: 'up',
  WARN: 'services_warn',
  CRIT: 'services_crit',
  UNKNOWN: 'services_unknown',
  UNHANDLED: 'unhandled',
  DOWNTIME: 'downtime',
  HOSTS_DOWN: 'hosts_down',
});

// Service states of Checkmk.
export const SERVICE_STATES = Object.freeze({ WARN: 1, CRIT: 2, UNKNOWN: 3 });
// Host states of Checkmk.
export const HOST_STATES = Object.freeze({ UP: 0, DOWN: 1, UNREACH: 2 });

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
// WARN, CRIT and UNKNOWN are the words of Checkmk in every language.
export const NAMES = {
  en: {
    [FEATURE_KEYS.UP]: 'Host up',
    [FEATURE_KEYS.WARN]: 'Services WARN',
    [FEATURE_KEYS.CRIT]: 'Services CRIT',
    [FEATURE_KEYS.UNKNOWN]: 'Services UNKNOWN',
    [FEATURE_KEYS.UNHANDLED]: 'Unhandled problems',
    [FEATURE_KEYS.DOWNTIME]: 'In downtime',
    [FEATURE_KEYS.HOSTS_DOWN]: 'Hosts down',
  },
  fr: {
    [FEATURE_KEYS.UP]: 'Hôte UP',
    [FEATURE_KEYS.WARN]: 'Services WARN',
    [FEATURE_KEYS.CRIT]: 'Services CRIT',
    [FEATURE_KEYS.UNKNOWN]: 'Services UNKNOWN',
    [FEATURE_KEYS.UNHANDLED]: 'Problèmes non traités',
    [FEATURE_KEYS.DOWNTIME]: 'En maintenance',
    [FEATURE_KEYS.HOSTS_DOWN]: 'Hôtes DOWN',
  },
  de: {
    [FEATURE_KEYS.UP]: 'Host UP',
    [FEATURE_KEYS.WARN]: 'Services WARN',
    [FEATURE_KEYS.CRIT]: 'Services CRIT',
    [FEATURE_KEYS.UNKNOWN]: 'Services UNKNOWN',
    [FEATURE_KEYS.UNHANDLED]: 'Unbehandelte Probleme',
    [FEATURE_KEYS.DOWNTIME]: 'In Wartungszeit',
    [FEATURE_KEYS.HOSTS_DOWN]: 'Hosts DOWN',
  },
  es: {
    [FEATURE_KEYS.UP]: 'Host UP',
    [FEATURE_KEYS.WARN]: 'Servicios WARN',
    [FEATURE_KEYS.CRIT]: 'Servicios CRIT',
    [FEATURE_KEYS.UNKNOWN]: 'Servicios UNKNOWN',
    [FEATURE_KEYS.UNHANDLED]: 'Problemas sin gestionar',
    [FEATURE_KEYS.DOWNTIME]: 'En mantenimiento',
    [FEATURE_KEYS.HOSTS_DOWN]: 'Hosts DOWN',
  },
};

export const SITE_NAME = 'Checkmk';

// Display bounds (the core never applies them on write).
export const MAX_COUNT = 100_000;

export const MODEL_HOST = 'Checkmk host';
export const MODEL_SITE = 'Checkmk site';
export const PARAMS = Object.freeze({ HOST: 'CHECKMK_HOST', SITE: 'CHECKMK_SITE' });

export const hostIds = (gladys, hostName) => gladys.externalIds(HOST_TYPE, hostName);
export const siteIds = (gladys) => gladys.externalIds(SITE_TYPE, SITE_ID);

/** The Checkmk host name of a device external id, null when it is not a host of ours. */
export function parseHostName(gladys, externalId) {
  const prefix = hostIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const name = externalId.slice(prefix.length);
  return name && !name.includes(':') ? name : null;
}

const readOnly = { read_only: true, has_feedback: false, keep_history: true };

function counter(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    ...readOnly,
    min: 0,
    max: MAX_COUNT,
  };
}

function binary(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.INPUT,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    ...readOnly,
    min: 0,
    max: 1,
  };
}

const SERVICE_COUNTERS = [FEATURE_KEYS.WARN, FEATURE_KEYS.CRIT, FEATURE_KEYS.UNKNOWN];
const STATE_OF = {
  [FEATURE_KEYS.WARN]: SERVICE_STATES.WARN,
  [FEATURE_KEYS.CRIT]: SERVICE_STATES.CRIT,
  [FEATURE_KEYS.UNKNOWN]: SERVICE_STATES.UNKNOWN,
};

/**
 * The discovery payload of a host.
 * @param {object} gladys SDK client
 * @param {object} host see CheckmkClient.snapshot()
 * @param {string} language feature names language
 */
export function buildHostDevice(gladys, host, language = 'en') {
  const ids = hostIds(gladys, host.name);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: (host.alias || host.name).slice(0, 255),
    external_id: ids.device,
    model: MODEL_HOST,
    should_poll: false,
    params: [{ name: PARAMS.HOST, value: host.name.slice(0, 255) }],
    features: [
      binary(names[FEATURE_KEYS.UP], ids.feature(FEATURE_KEYS.UP)),
      ...SERVICE_COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      counter(names[FEATURE_KEYS.UNHANDLED], ids.feature(FEATURE_KEYS.UNHANDLED)),
      binary(names[FEATURE_KEYS.DOWNTIME], ids.feature(FEATURE_KEYS.DOWNTIME)),
    ],
  };
}

/** The discovery payload of the "Checkmk" device. */
export function buildSiteDevice(gladys, site, language = 'en') {
  const ids = siteIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: SITE_NAME,
    external_id: ids.device,
    model: MODEL_SITE,
    should_poll: false,
    params: [{ name: PARAMS.SITE, value: String(site ?? '').slice(0, 255) }],
    features: [
      counter(names[FEATURE_KEYS.HOSTS_DOWN], ids.feature(FEATURE_KEYS.HOSTS_DOWN)),
      ...SERVICE_COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      counter(names[FEATURE_KEYS.UNHANDLED], ids.feature(FEATURE_KEYS.UNHANDLED)),
    ],
  };
}

export const isDown = (host) => host.state !== null && host.state !== HOST_STATES.UP;

/** A problem Checkmk calls "unhandled": neither acknowledged nor in a downtime. */
export const isUnhandled = (problem) => !problem.acknowledged && !problem.downtime;

/** Unhandled problems of hosts (DOWN, UNREACH) and of their services. */
export const unhandledCount = (hosts, services) =>
  hosts.filter((host) => isDown(host) && isUnhandled(host)).length +
  services.filter(isUnhandled).length;

/**
 * Feature values of a host (null: nothing to publish).
 * @param {object[]} services the services of this host that are not OK
 * @returns {Array<{ externalId: string, value: number|null }>}
 */
export function hostValues(gladys, host, services) {
  const ids = hostIds(gladys, host.name);
  return [
    {
      externalId: ids.feature(FEATURE_KEYS.UP),
      value: host.state === null ? null : host.state === HOST_STATES.UP ? 1 : 0,
    },
    ...SERVICE_COUNTERS.map((key) => ({
      externalId: ids.feature(key),
      value: services.filter((service) => service.state === STATE_OF[key]).length,
    })),
    { externalId: ids.feature(FEATURE_KEYS.UNHANDLED), value: unhandledCount([host], services) },
    { externalId: ids.feature(FEATURE_KEYS.DOWNTIME), value: host.downtime ? 1 : 0 },
  ];
}

/** Feature values of the site device. */
export function siteValues(gladys, hosts, services) {
  const ids = siteIds(gladys);
  return [
    { externalId: ids.feature(FEATURE_KEYS.HOSTS_DOWN), value: hosts.filter(isDown).length },
    ...SERVICE_COUNTERS.map((key) => ({
      externalId: ids.feature(key),
      value: services.filter((service) => service.state === STATE_OF[key]).length,
    })),
    { externalId: ids.feature(FEATURE_KEYS.UNHANDLED), value: unhandledCount(hosts, services) },
  ];
}
