---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/upgrade-to-v1.html
---

# Upgrade to v1.x [upgrade-to-v1]

The following is a guide on upgrading your Node.js agent from version 0.x to version 1.x.

## Overview [v1-overview]

Version 1.x of the Node.js agent requires version 6.2 of the APM Server or higher.

The term "trace" was previously used to describe a small piece of work instrumented by the agent during a transaction. To align with modern APM vendors, we now refer to this as a "span"

The term "app" was previously used to describe your Node.js application in relation to Elastic APM. To be more specific, we now refer to this as a "service".


## Config options [v1-config-options]

The following config options have been removed in version 1.0.0:

|     |     |
| --- | --- |
| Name | Note |
| `logBody` | Use [`captureBody`](/reference/configuration.md#capture-body) instead. Note that this option is not a boolean |

The following config options have been renamed between version 0.x and 1.x.

::::{note}
The associated environment variable for each renamed config option have been renamed accordingly as well.
::::


|     |     |     |
| --- | --- | --- |
| Old name | New name | Note |
| `appName` | [`serviceName`](/reference/configuration.md#service-name) | Renamed to align with new naming conventions |
| `appVersion` | [`serviceVersion`](/reference/configuration.md#service-version) | Renamed to align with new naming conventions |
| `captureTraceStackTrace` | [`captureSpanStackTraces`](/reference/configuration.md#capture-span-stack-traces) | Renamed to align with new naming conventions |
| `sourceContextErrorAppFrames` | [`sourceLinesErrorAppFrames`](/reference/configuration.md#source-context-error-app-frames) | Renamed to align with other agents |
| `sourceContextSpanAppFrames` | [`sourceLinesSpanAppFrames`](/reference/configuration.md#source-context-span-app-frames) | Renamed to align with other agents |
| `sourceContextErrorLibraryFrames` | [`sourceLinesErrorLibraryFrames`](/reference/configuration.md#source-context-error-library-frames) | Renamed to align with other agents |
| `sourceContextSpanLibraryFrames` | [`sourceLinesSpanLibraryFrames`](/reference/configuration.md#source-context-span-library-frames) | Renamed to align with other agents |
| `validateServerCert` | [`verifyServerCert`](/reference/configuration.md#validate-server-cert) | Renamed to align with other agents |


## Agent API [v1-agent-api]

The following functions have been renamed between version 0.x and 1.x:

|     |     |     |
| --- | --- | --- |
| Old name | New name | Note |
| `buildTrace()` | `buildSpan()` | Renamed to align with new naming conventions |


