# OpenTelemetry Bridge

This document includes design / developer / maintenance notes for the
Node.js APM Agent *OpenTelemetry Bridge*.

XXX explain opentelemetry-core-mini/ dir. Adding an @opentelemetry/core dep
    adds ~2.6MB to install. That's too much for the (currently) small code
    usage we have there.

## Why a separate package?

XXX Decide if preparing for an OTel API *2.x* justifies having a separate package.
  See TODO in NOTES.

## Versioning

XXX


## Maintenance

- We should release a new agent version with an updated "@opentelemetry/api"
  dependency relatively soon after any new *minor* release. Otherwise a user
  upgrading their "@opentelemetry/api" dep to "1.x+1", e.g. "1.2.0", will find
  that the OTel Bridge which uses version "1.x", e.g. "1.1.0" or lower, does
  not work.

  The reason is that the OTel Bridge registers a global tracer (and other)
  providers with its version of the OTel API. When user code attempts to *get*
  a tracer with its version of the OTel API, the [OTel API compatibility
  logic](https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.1.0/src/internal/semver.ts#L24-L33)
  decides that using a v1.1.x Tracer with a v1.2.0 Tracer API is not
  compatible.



