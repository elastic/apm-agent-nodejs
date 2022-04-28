'use strict'

const assert = require('assert')

const otel = require('@opentelemetry/api')

const GenericSpan = require('../instrumentation/generic-span')
const osdklog = require('./osdklog')
const { otelSpanContextFromTraceContext, epochMsFromOTelTimeInput } = require('./otelutils')
const { RESULT_SUCCESS, OUTCOME_UNKNOWN, OUTCOME_SUCCESS, RESULT_FAILURE, OUTCOME_FAILURE } = require('../constants')
const Span = require('../instrumentation/span')
const Transaction = require('../instrumentation/transaction')

// Based on `isHomogeneousAttributeValueArray` from
// packages/opentelemetry-core/src/common/attributes.ts
function isHomogeneousArrayOfStrNumBool (arr) {
  const len = arr.length
  let elemType = null
  for (let i = 0; i < len; i++) {
    const elem = arr[i]
    if (elem === undefined || elem === null) {
      continue
    }
    if (!elemType) {
      elemType = typeof elem
      if (!(elemType === 'string' || elemType === 'number' || elemType === 'boolean')) {
        return false
      }
    } else if (typeof elem !== elemType) { // eslint-disable-line valid-typeof
      return false
    }
  }
  return true
}

// Set the given attribute key `k` and `v` according to these OTel rules:
// https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/common/README.md#attribute
function maybeSetOTelAttr (attrs, k, v) {
  // XXX Guard number of attributes? Currently we don't. Nor for
  // labels/tags. OTel spec says SDK "SHOULD" and JS OTel SDK does with
  // default 128.

  if (Array.isArray(v)) {
    // Is it homogeneous? Nulls and undefineds are allowed.
    if (isHomogeneousArrayOfStrNumBool(v)) {
      attrs[k] = v.slice()
    }
  } else {
    switch (typeof v) {
      case 'number':
      case 'boolean':
        attrs[k] = v
        break
      case 'string':
        // XXX truncation is done in eclient. It defaults to 1024
        //    (hardcoded). This is what current labels/tags are truncated to.
        //    If we want to use longFieldMaxLength, then we'll need to add
        //    support for that. OTel default attribute limit is `AttributeValueLengthLimit (Default=Infinity)`
        attrs[k] = v
        break
    }
  }
}

// This wraps a core Transaction or Span in the OTel API's `inteface Span`.
class OTelSpan {
  constructor (span) {
    assert(span instanceof GenericSpan)
    this._span = span
    this._spanContext = null
  }

  toString () {
    return `OTelSpan<${this._span.constructor.name}<${this._span.id}, "${this._span.name}">>`
  }

  // ---- OTel interface Span
  // https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/trace/span.ts

  spanContext () {
    osdklog.apicall('%s.spanContext()', this)
    if (!this._spanContext) {
      this._spanContext = otelSpanContextFromTraceContext(this._span._context)
    }
    return this._spanContext
  }

  setAttribute (key, value) {
    if (this._span.ended || !key || typeof key !== 'string') {
      return this
    }

    const attrs = this._span._getOTelAttributes()
    maybeSetOTelAttr(attrs, key, value)

    return this
  }

  setAttributes (attributes) {
    if (this._span.ended || !attributes || typeof attributes !== 'object') {
      return this
    }

    const attrs = this._span._getOTelAttributes()
    for (const k in attributes) {
      if (k.length === 0) continue
      maybeSetOTelAttr(attrs, k, attributes[k])
    }

    return this
  }

  // Span events are not currently supported.
  addEvent (name, attributesOrStartTime, startTime) {
    return this
  }

  setStatus (otelSpanStatus) {
    if (this._span.ended) {
      return this
    }
    switch (otelSpanStatus) {
      case otel.SpanStatusCode.ERROR:
        this._span.setOutcome(OUTCOME_FAILURE)
        break
      case otel.SpanStatusCode.OK:
        this._span.setOutcome(OUTCOME_SUCCESS)
        break
      case otel.SpanStatusCode.UNSET:
        this._span.setOutcome(OUTCOME_UNKNOWN)
        break
    }
    // Also set transaction.result, similar to the Java APM agent.
    if (this._span instanceof Transaction) {
      switch (otelSpanStatus) {
        case otel.SpanStatusCode.ERROR:
          this._span.result = RESULT_FAILURE
          break
        case otel.SpanStatusCode.OK:
          this._span.result = RESULT_SUCCESS
          break
      }
    }
    return this
  }

  updateName (name) {
    if (this._span.ended) {
      return this
    }
    this._span.name = name
    return this
  }

  end (otelEndTime) {
    osdklog.apicall('%s.end(endTime=%s)', this, otelEndTime)
    const endTime = otelEndTime === undefined
      ? undefined
      : epochMsFromOTelTimeInput(otelEndTime)
    if (this._span instanceof Transaction) {
      this._span.end(undefined, endTime)
    } else {
      assert(this._span instanceof Span)
      this._span.end(endTime)
    }
  }

  /**
   * Returns the flag whether this span will be recorded.
   *
   * @returns true if this Span is active and recording information like events
   *     with the `AddEvent` operation and attributes using `setAttributes`.
   */
  isRecording () {
    // XXX go false after ended. See "IsRecording becomes false after End" entry at https://github.com/open-telemetry/opentelemetry-specification/blob/main/spec-compliance-matrix.md
    return this._span.sampled
  }

  // /**
  //  * Sets exception as a span event
  //  * @param exception the exception the only accepted values are string or Error
  //  * @param [time] the time to set as Span's event time. If not provided,
  //  *     use the current time.
  //  */
  // recordException(exception: Exception, time?: TimeInput): void;
}

module.exports = {
  OTelSpan
}
