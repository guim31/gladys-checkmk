# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-20

### Added

- One device per Checkmk host (every host the automation user sees, or a
  Setup folder and host labels): host up, services in WARN, CRIT and UNKNOWN,
  unhandled problems, in downtime.
- A "Checkmk" device: the hosts down and the service problems of the site.
- Scene triggers: a host goes down, a host is back up, a service has a problem
  (filter by state: WARN, CRIT, UNKNOWN), a service is OK again, Checkmk no
  longer answers. Problems in a downtime are announced only if they outlast
  it.
- Scene actions: acknowledge the problems of a host with a comment (can be
  turned off in the configuration), read the problems for a message.
- Dashboard widget: the hosts down and the services in problem, the most
  serious first, with the unhandled ones.
- Checkmk 2.2 or later (REST API, automation user), every edition; feature
  names, messages and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-checkmk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-checkmk/releases/tag/v1.0.0
