'use strict'

const otel = require('@opentelemetry/api')

const agent = require('../..')
const { OUTCOME_UNKNOWN } = require('../constants')
const { traceparentStrFromOTelSpanContext } = require('./otelutils')

// This class is used to handle OTel's concept of a `NonRecordingSpan` -- a
// span that is never sent/exported, but can carry SpanContext (i.e. W3C
// trace-context) that should be propagated. For a use case, see:
// "test/opentelemetry-bridge/fixtures/nonrecordingspan-parent.js"
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
    this.type = null
    this.subtype = null
    this.action = null
    this.outcome = OUTCOME_UNKNOWN
    this.ended = false
    this.result = ''
  }

  get id () {
    return this._spanContext.spanId
  }

  get traceparent () {
    return traceparentStrFromOTelSpanContext(this._spanContext)
  }

  get ids () {
    return {
      'trace.id': this._spanContext.traceId,
      'transaction.id': this._spanContext.spanId
    }
  }

  setType () {
  }

  setLabel (_key, _value, _stringify) {
    return false
  }

  addLabels (_labels, _stringify) {
    return false
  }

  setOutcome (_outcome) {
  }

  startSpan () {
    return null
  }

  ensureParentId () {
    return ''
  }

  // ---- private class Transaction API
  // Only the parts of that API that are used on instances of this class.

  createSpan () {
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
    if (agent._conf.useElasticTraceparentHeader) {
      setter(carrier, 'elastic-apm-traceparent', traceparentStr)
    }

    if (this._spanContext.traceState) {
      // XXX test coverage for this
      setter(carrier, 'tracestate', this._spanContext.traceState.serialize())
    }
  }

  // ---- OTel interface Span
  // Implementation adapted from opentelemetry-js-api/src/trace/NonRecordingSpan.ts

  spanContext () {
    return this._spanContext
  }

  setAttribute (_key, _value) {
    return this
  }

  setAttributes (_attributes) {
    return this
  }

  addEvent (_name, _attributes) {
    return this
  }

  setStatus (_status) {
    return this
  }

  updateName (_name) {
    return this
  }

  end (_endTime) {}

  // isRecording always returns false for NonRecordingSpan.
  isRecording () {
    return false
  }

  recordException (_exception, _time) {}
}

module.exports = {
  OTelBridgeNonRecordingSpan
}
