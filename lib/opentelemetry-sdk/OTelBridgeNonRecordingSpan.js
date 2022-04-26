'use strict'

const otel = require('@opentelemetry/api')

const { traceparentStrFromOTelSpanContext } = require('./otelutils')

// This class is used to handle OTel's concept of a `NonRecordingSpan` -- a
// span that is never sent/exported, but can carry SpanContext (i.e. W3C
// trace-context) that should be propagated. For a use case, see:
// "test/opentelemetry-sdk/fixtures/nonrecordingspan-parent.js"
//
// This masquerades as a GenericSpan on the agent's internal run-context
// tracking. Therefore it needs to support enough of GenericSpan's interface
// for that to work.
//
// This also needs to support enough of OTel API's `interface Span` -- mostly
// mimicking the behavior of OTel's internal `NonRecordingSpan`:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/trace/NonRecordingSpan.ts
//
// XXX It isn't yet clear if we need to reproduce *all* of NonRecordingSpan
//     and all of Transaction's interface. TODO: test cases with mixed API
//     usage. A: I think we *do* need to implement the full *public* API at least.
class OTelBridgeNonRecordingSpan {
  constructor (otelNonRecordingSpan) {
    this._spanContext = otelNonRecordingSpan.spanContext()
    this.name = ''
    this.ended = false
  }

  get id () {
    return this._spanContext.spanId
  }

  createSpan () {
    return null
  }

  startSpan () {
    return null
  }

  // GenericSpan#propagateTraceContextHeaders()
  //
  // Implementation adapted from OTel's W3CTraceContextPropagator#inject().
  propagateTraceContextHeaders (carrier, setter) {
    if (!carrier || !setter) {
      return
    }
    if (!this._spanContext || !otel.isSpanContextValid(this._spanContext)) {
      return
    }

    const traceparentStr = traceparentStrFromOTelSpanContext(this._spanContext)
    setter(carrier, 'traceparent', traceparentStr)
    // Limitation: Currently this implementation does not set the
    // 'elastic-apm-traceparent' header per `conf.useElasticTraceparentHeader`.
    // Doing so would require (somewhat awkwardly) passing the agent config
    // through to OTelBridgeNonRecordingSpan instances, or tweaking
    // `propagateTraceContextHeaders` to pass that config.
    // if (this._conf.useElasticTraceparentHeader) {
    //   setter(carrier, 'elastic-apm-traceparent', traceparentStr)
    // }

    if (this._spanContext.traceState) {
      // XXX test coverage for this
      setter(carrier, 'tracestate', this._spanContext.traceState.serialize())
    }
  }

  // ---- OTel interface Span

  spanContext () {
    return this._spanContext
  }
}

module.exports = {
  OTelBridgeNonRecordingSpan
}
