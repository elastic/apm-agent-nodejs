'use strict'

const assert = require('assert')
const GenericSpan = require('../instrumentation/generic-span')

const osdklog = require('./osdklog')
const { otelSpanContextFromTraceContext } = require('./otelutils')

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
    osdklog.apicall(`${this.toString()}.spanContext()`)
    if (!this._spanContext) {
      this._spanContext = otelSpanContextFromTraceContext(this._span._context)
    }
    return this._spanContext
  }

  setAttribute (key, value) {
    // XXX validation? slice arrays, etc.
    //     packages/opentelemetry-core/src/common/attributes.ts
    //    https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/common/README.md#attribute
    // XXX need to work about prototype pollution? __proto__?
    // XXX HERE share the guarding in setAttributes, but don't refetch _getOTelAttributes everytime
    //      XXX *This* guarding needs to ensure `key` is a string, else all the same.
    return this
  }

  setAttributes (attributes) {
    if (!attributes || typeof attributes !== 'object') {
      return this
    }

    const attrs = this._span._getOTelAttributes()
    for (const [k, v] of Object.entries(attributes)) {
      // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/common/README.md#attribute
      if (k.length === 0) continue

      // XXX Guard number of attributes? Currently we don't. Nor for
      // labels/tags. OTel spec says SDK "SHOULD" and JS OTel SDK does with
      // default 128.

      if (Array.isArray(v)) {
        // Is it homogeneous (nulls and undefineds are allowed)?
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

    // for (const [k, v] of Object.entries(attributes)) {
    //   this.setAttribute(k, v)
    // }
    return this
  }

  // /**
  //  * Adds an event to the Span.
  //  *
  //  * @param name the name of the event.
  //  * @param [attributesOrStartTime] the attributes that will be added; these are
  //  *     associated with this event. Can be also a start time
  //  *     if type is {@type TimeInput} and 3rd param is undefined
  //  * @param [startTime] start time of the event.
  //  */
  // addEvent(
  //   name: string,
  //   attributesOrStartTime?: SpanAttributes | TimeInput,
  //   startTime?: TimeInput
  // ): this;

  // /**
  //  * Sets a status to the span. If used, this will override the default Span
  //  * status. Default is {@link SpanStatusCode.UNSET}. SetStatus overrides the value
  //  * of previous calls to SetStatus on the Span.
  //  *
  //  * @param status the SpanStatus to set.
  //  */
  // setStatus(status: SpanStatus): this;

  // /**
  //  * Updates the Span name.
  //  *
  //  * This will override the name provided via {@link Tracer.startSpan}.
  //  *
  //  * Upon this update, any sampling behavior based on Span name will depend on
  //  * the implementation.
  //  *
  //  * @param name the Span name.
  //  */
  // updateName(name: string): this;

  /**
   * Marks the end of Span execution.
   *
   * Call to End of a Span MUST not have any effects on child spans. Those may
   * still be running and can be ended later.
   *
   * Do not return `this`. The Span generally should not be used after it
   * is ended so chaining is not desired in this context.
   *
   * @param [endTime] the time to set as Span's end time. If not provided,
   *     use the current time as the span's end time.
   */
  // end(endTime?: TimeInput): void;
  // XXX
  end (otelEndTime) {
    // XXX convert otelEndTime to our endTime
    osdklog.apicall('OTelSpan.end(endTime=%s)', otelEndTime)
    this._span.end()
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

module.exports = {
  OTelSpan
}
