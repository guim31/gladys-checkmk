// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is this host down?" is already a scene condition on the device features.
// These two actions do what a condition cannot:
//   - acknowledge the problems of a host from a scene (a button of the
//     dashboard, a vocal command, a "seen" reply), with a comment in Checkmk:
//     the host problem if it is DOWN or UNREACH, and each of its services in
//     WARN, CRIT or UNKNOWN not acknowledged yet — can be turned off in the
//     configuration;
//   - put the problems in words for a message ("3 problems: NAS: DOWN…"),
//     across every host, added to Gladys or not.
// Both read Checkmk again when the last read is older than 15 seconds.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isDown, isUnhandled } from './devices.js';
import { ERROR_KINDS } from './checkmk/client.js';
import { ACTION_TEXT, ERROR_TEXT, pick } from './texts.js';

const logger = createLogger({ name: 'checkmk-scenes' });

// Problems listed in the `names` output, at most (the rest is counted).
export const MAX_LISTED_PROBLEMS = 20;
// Checkmk keeps the comment whole; a scene does not need more.
export const MAX_COMMENT_LENGTH = 1000;

function assertReadable(hub) {
  const language = hub.config?.language;
  if (!hub.client) {
    throw new Error(pick(ACTION_TEXT.noServer, language));
  }
  if (hub.error || !hub.data) {
    throw new Error(pick(ERROR_TEXT[hub.error?.kind ?? ERROR_KINDS.UNREACHABLE], language));
  }
}

// Checkmk refuses a problem that ended meanwhile (host: 422 "has no problem",
// service: 400 "Service not found"): nothing left to acknowledge.
const isGone = (err) =>
  err.kind === ERROR_KINDS.API &&
  [400, 422].includes(err.status) &&
  /not found|no problem|doesn't exist/i.test(err.message);

export const SCENE_ACTIONS = {
  async acknowledge_host_problems(hub, { fields = {} }) {
    const language = hub.config?.language;
    if (!hub.client) {
      throw new Error(pick(ACTION_TEXT.noServer, language));
    }
    if (!hub.config.allowAcknowledge) {
      throw new Error(pick(ACTION_TEXT.acknowledgeDisabled, language));
    }
    await hub.refreshIfStale();
    assertReadable(hub);
    const host = hub.findHost(fields.device);
    if (!host) {
      throw new Error(pick(ACTION_TEXT.unknownHost, language));
    }
    const typed = typeof fields.message === 'string' ? fields.message.trim() : '';
    const comment = (typed || pick(ACTION_TEXT.defaultComment, language)).slice(
      0,
      MAX_COMMENT_LENGTH,
    );
    const tasks = [];
    if (isDown(host) && !host.acknowledged) {
      tasks.push(() => hub.client.acknowledgeHost(host.name, comment));
    }
    for (const service of hub.servicesOf(host.name)) {
      if (!service.acknowledged) {
        tasks.push(() => hub.client.acknowledgeService(host.name, service.service, comment));
      }
    }
    let acknowledged = 0;
    for (const task of tasks) {
      try {
        await task();
        acknowledged += 1;
      } catch (err) {
        if (isGone(err)) {
          logger.debug(`Nothing left to acknowledge: ${err.message}`);
          continue;
        }
        logger.warn(`Acknowledging the problems of ${host.name} failed: ${err.message}`);
        if (acknowledged > 0) {
          await hub.pollAll({ fresh: true });
        }
        if (err.kind === ERROR_KINDS.API) {
          throw new Error(pick(ACTION_TEXT.acknowledgeRefused, language), { cause: err });
        }
        throw new Error(pick(ERROR_TEXT[err.kind] ?? ERROR_TEXT.http, language), { cause: err });
      }
    }
    if (tasks.length === 0) {
      return { acknowledged: 0 };
    }
    logger.info(`${acknowledged} problem(s) of ${host.name} acknowledged`);
    await hub.pollAll({ fresh: true });
    return { acknowledged };
  },

  async get_problems(hub, { fields = {} }) {
    const language = hub.config?.language;
    await hub.refreshIfStale();
    assertReadable(hub);
    let scope = null;
    if (fields.device) {
      const host = hub.findHost(fields.device);
      if (!host) {
        throw new Error(pick(ACTION_TEXT.unknownHost, language));
      }
      scope = new Set([host.name]);
    }
    const problems = hub.problems(scope);
    const listed = problems
      .slice(0, MAX_LISTED_PROBLEMS)
      .map((problem) => hub.problemLabel(problem, language));
    const services = problems.filter((problem) => problem.service);
    const ofState = (state) => services.filter((problem) => problem.state === state).length;
    return {
      count: problems.length,
      unhandled: problems.filter(isUnhandled).length,
      hosts_down: problems.length - services.length,
      services_crit: ofState(2),
      services_warn: ofState(1),
      services_unknown: ofState(3),
      names:
        problems.length > listed.length
          ? `${listed.join(', ')}, +${problems.length - listed.length}`
          : listed.join(', '),
    };
  },
};
