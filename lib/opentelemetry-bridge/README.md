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

## Development / Debugging

XXX

oblog

hooking up otel.diag when tracing is enabled

## Design Overview

XXX

This bridge does *not* currently [set a global propagator](https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.1.0/src/api/propagation.ts#L65).
This means that the `otel.propagation.*` API gets the default (no-op)
implementation. AFAIK this only impacts Baggage usage, which isn't supported by
the bridge, and `otel.propagation.{inject,extract}()` usage by some
OpenTelemetry packages that we do not use (e.g.
`@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-fetch`).

## Limitations / Differences with OpenTelemetry SDK

- The OpenTelemetry SDK defines [SpanLimits](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#span-limits).
  This OpenTelemetry Bridge differs as follows:
  - Attribute count is not limited. The OTel SDK defaults to a limit of 128.
    (To implement this, start at `maybeSetOTelAttr` in "OTelSpan.js".)
  - Attribute value strings are truncated at 1024 bytes. The OpenTelemetry SDK
    uses `AttributeValueLengthLimit (Default=Infinity)`.
    (We could consider using the configurable `longFieldMaxLength` for the
    attribute value truncation limit, if there is a need.)
  - Span links and events are not current supported by this bridge.

- The OpenTelemetry Bridge spec says APM agents
  ["MAY"](https://github.com/elastic/apm/blob/main/specs/agents/tracing-api-otel.md#attributes-mapping)
  report OTel span attributes as spad and transaction *labels* if the upstream
  APM Server is less than version 7.16. This implementation opts *not* to do
  that. The OTel spec allows a larger range of types for span attributes values
  than is allowed for "tags" (aka labels) in the APM Server intake API, so some
  further filtering of attributes would be required.

- There is a known issue with the `asyncHooks: false` config option and
  `tracer.startActiveSpan(name, async function fn () { ... })` where run
  context is lost after the first `await ...` usage in that given `fn`.
  See https://github.com/elastic/apm-agent-nodejs/issues/2679.

- There is a semantic difference between this OTel Bridge and the OpenTelemetry
  SDK with `span.end()` that could impact parent/child relationships of spans.
  This demonstrates the different:

    ```js
    const otel = require('@opentelemetry/api')
    const tracer = otel.trace.getTracer()
    tracer.startActiveSpan('s1', s1 => {
      tracer.startActiveSpan('s2', s2 => {
        s2.end()
      })
      s1.end()
      tracer.startActiveSpan('s3', s3 => {
        s3.end()
      })
    })
    ```

  With the OTel SDK that will yield:

    ```
    span s1
    `- span s2
    `- span s3
    ```

  With the Elastic APM agent:

    ```
    transaction s1
    `- span s2
    transaction s3
    ```

  In current Elastic APM semantics, when a span is ended (e.g. `s1` above) it is
  *no longer the current/active span in that async context*. This is historical
  and allows a stack of current spans in sync code, e.g.:

    ```js
    const t1 = apm.startTransaction('t1')
    const s2 = apm.startSpan('s2')
    const s3 = apm.startSpan('s3') // s3 is a child of s2
    s3.end() // s3 is no longer active (popped off the stack)
    const s4 = apm.startSpan('s4') // s4 is a child of s2
    s4.end()
    s2.end()
    t1.end()
    ```

  This semantic difference is not expected to be common, because it is expected
  that typically OTel API user code will end a span only at the end of its
  function:

    ```js
    tracer.startActiveSpan('mySpan', mySpan => {
      // ...
      mySpan.end() // .end() only at end of function block
    })
    ```

  Note that active span context *is* properly maintained when a new async task
  is created (e.g. with `setTimeout`, etc.), so the following code produces
  the expected trace:

    ```js
    tracer.startActiveSpan('s1', s1 => {
    setImmediate(() => {
      tracer.startActiveSpan('s2', s2 => {
        s2.end()
      })
      setTimeout(() => {  // s1 is bound as the active span in this async task.
        tracer.startActiveSpan('s3', s3 => {
          s3.end()
        })
      }, 100)
      s1.end()
    })
    ```

  If this *does* turn out to be a common issue, the OTel semantics for span.end()
  can likely be accommodated.


XXX


