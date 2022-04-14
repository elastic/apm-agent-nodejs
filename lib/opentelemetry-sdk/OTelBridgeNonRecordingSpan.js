'use strict'

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
//     and all of GenericSpan's interface. TODO: test cases with mixed API
//     usage; and with a current NonRecordingSpan leading into auto-instrumentation.
class OTelBridgeNonRecordingSpan {
  constructor (otelNonRecordingSpan) {
    this._spanContext = otelNonRecordingSpan.spanContext()
    this.name = ''
    this.ended = false
  }

  spanContext () {
    return this._spanContext
  }

  get id () {
    return this._spanContext.spanId
  }
}

module.exports = {
  OTelBridgeNonRecordingSpan
}
