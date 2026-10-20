# Checkmk for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Checkmk](https://checkmk.com/): your monitored hosts and their services in
Gladys, scenes that react when a host goes down or a service fails, the
problems of a host acknowledged from a scene, and a dashboard widget of the
problems in progress.

It reads the REST API of your Checkmk site on your local network, with an
automation user.

## Features

- **One device per host** (every host the automation user sees, or a Setup
  folder and host labels): host up, services in WARN, CRIT and UNKNOWN,
  unhandled problems, in downtime.
- **A "Checkmk" device**: the hosts down and the service problems of the
  site.
- **Scene triggers**: a host goes down, a host is back up, a service has a
  problem (filter: WARN, CRIT, UNKNOWN), a service is OK again, Checkmk no
  longer answers. Problems in a downtime are held, as Checkmk holds its
  notifications.
- **Scene actions**: acknowledge the problems of a host (with a comment, can
  be turned off), read the problems (counts and list).
- **Widget**: the hosts down and the services in problem, the most serious
  first, with the unhandled ones.
- Feature names, messages and documentation in English, French, German and
  Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Checkmk 2.2 or later, any edition (Community, formerly Raw, included).
- An automation user ("Automation secret for machine accounts"), role "Normal
  monitoring user", in a contact group of the hosts to follow.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-checkmk` (or
   install **Checkmk** from the catalog once it is listed).
2. In **Configuration**, enter the address of the site
   (`http://192.168.1.2/mysite`), the automation user and its secret. Save,
   then click **Test the connection**.
3. Open the **Discover** tab and add the hosts to follow.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Every minute by default, the integration sends two GET requests to the REST
API (`/<site>/check_mk/api/1.0`): the hosts (`domain-types/host/collections/all`
with Livestatus columns: state, acknowledged, downtime, labels, folder) and
the services that are not OK (`domain-types/service/collections/all` with a
`state != 0` query), plus `version` once an hour. The states of the added
devices are sent only when they change (and every 6 hours), the scene events
on every change, added device or not. The problems already seen are kept in
`/data`: a restart neither repeats nor misses one. Acknowledgements are POSTs
on `domain-types/acknowledge/collections/host|service`, sticky, without
notification.

## Checked on a real Checkmk

On 20/10/2026, the Docker image of the integration ran with the constraints
of the Gladys sandbox (read-only rootfs, no capability, 256 MB, about 19 MB
used at rest) against Checkmk 2.5.0p16 Community (official Docker image) with
an automation user of role "Normal monitoring user": a host monitored by the
agent of the container, a host DOWN, a host UNREACH behind it, a host in a
downtime, local checks forced to WARN and CRIT then changed. Discovery,
states, events (service worsened, service recovered), acknowledgement,
widget, refused secret, wrong site, stopped site. The answers are kept as
fixtures in [`test/fixtures/checkmk`](test/fixtures/checkmk). Checkmk 2.2 to
2.4 use the same documented API but were not run.

## Limitations

- One Checkmk site per integration; host and service states only (no
  metrics).
- A service in problem removed from monitoring counts as OK again.
- At most 30 scene events per read.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and an in-memory Checkmk
(`test/helpers/fakeCheckmk.js`) seeded with real answers. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Started from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and the [integration SDK](https://github.com/GladysAssistant/integration-sdk-js)
  of Gladys Assistant (Apache-2.0).
- The [Checkmk REST API documentation](https://docs.checkmk.com/latest/en/rest_api.html)
  and the answers of a real Checkmk 2.5 site were the references for the API
  calls; no code is copied from another project.
- Cover: the Checkmk logo from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CheckMK_logo.svg)
  (public domain), by Checkmk GmbH.
- Architecture shared with
  [gladys-zabbix](https://github.com/guim31/gladys-zabbix).

## Disclaimer

Not affiliated with Checkmk GmbH. Checkmk is a trademark of Checkmk GmbH.

## License

[Apache-2.0](LICENSE)
