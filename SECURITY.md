# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the automation secret of the Checkmk user is a `secret` field
  of the Gladys configuration. The integration reads it from Gladys at
  startup, keeps it in memory, sends it only to the Checkmk address of the
  configuration (the `Authorization: Bearer <user> <secret>` header), and
  never writes it to `/data` nor to the logs. The secret has the rights of its
  Checkmk user: a "Normal monitoring user" is enough, and the acknowledgement
  scene action can be turned off.
- **Stored in `/data`**: `checkmk-state.json`, the problems already seen (host
  and service names, state, start time), the address, folder and labels of the
  configuration, and a truncated hash of the user and secret, so that a restart neither repeats nor misses a scene event. No secret.
- **Network**: requests go only to the Checkmk address typed in the
  configuration, in HTTP or HTTPS. HTTPS certificates are verified unless the
  user ticks "Accept self-signed certificates"; the integration opens no port
  and calls no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Checkmk itself, and the hosts it monitors.
