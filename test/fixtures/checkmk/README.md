# Checkmk fixtures

`checkmk-2.5.0.json`: real requests and answers of the REST API of the
official Docker image `checkmk/check-mk-community` 2.5.0p16 (October 2026),
site `cmk`, read by an automation user of role "Normal monitoring user":
`localhost` monitored by the agent of the container (local checks forced to
WARN and CRIT), `deadhost` DOWN (acknowledged), `behindhost` UNREACH behind
it, `outside` in two downtimes. Each entry holds the request (method, path,
parameters, never the secret), the HTTP status and the answer; addresses are
replaced by `192.0.2.10`.

The answers of refused or missing credentials (`bad_credentials`,
`no_credentials`) and of acknowledgements (`acknowledge_service`: 204,
`acknowledge_host_without_problem`: 422, `acknowledge_service_ok`: 400) are
real too. `test/helpers/fakeCheckmk.js` serves these hosts and services.
