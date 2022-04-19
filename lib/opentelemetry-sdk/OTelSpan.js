'use strict'

const assert = require('assert')
const GenericSpan = require('../instrumentation/generic-span')

const osdklog = require('./osdklog')

// This wraps a core Transaction or Span in the OTel API's `inteface Span`.
class OTelSpan {
  constructor (span) {
    assert(span instanceof GenericSpan)
    this._span = span
  }

  toString () {
    return `OTelSpan<${this._span.constructor.name}<${this._span.id}, "${this._span.name}">>`
  }

  // ---- OTel interface Span
  // https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/trace/span.ts

  /**
   * Returns the {@link SpanContext} object associated with this Span.
   *
   * Get an immutable, serializable identifier for this span that can be used
   * to create new child spans. Returned SpanContext is usable even after the
   * span ends.
   *
   * @returns the SpanContext object associated with this Span.
   */
  spanContext () {
    // XXX possibly cache this
    osdklog.apicall(`${this.toString()}.spanContext()`)
    const traceparent = this._span._context.traceparent
    const otelSpanContext = {
      traceId: traceparent.traceId,
      spanId: traceparent.id,
      // `traceparent.flags` is a two-char hex string. `traceFlags` is a number.
      // This conversion assumes `traceparent.flags` are valid.
      traceFlags: parseInt(traceparent.flags, 16)
    }
    const traceStateStr = this._span._context.toTraceStateString()
    if (traceStateStr) {
      console.log('XXX WARNING: OTelSpan.spanContext(): skipping bridging TraceState classes for now, ugh')
      // XXX TODO: a OTelBridgeTraceState wrapper around our TraceState. *Perhaps*
      //      could just do a OTelBridgeReadableTraceState that implements only
      //      `get()` and `serialize()` if that is all that is needed here.
      // otelSpanContext.traceState = XXX
    }
    return otelSpanContext
  }

  // /**
  //  * Sets an attribute to the span.
  //  *
  //  * Sets a single Attribute with the key and value passed as arguments.
  //  *
  //  * @param key the key for this attribute.
  //  * @param value the value for this attribute. Setting a value null or
  //  *              undefined is invalid and will result in undefined behavior.
  //  */
  // setAttribute(key: string, value: SpanAttributeValue): this;

  // /**
  //  * Sets attributes to the span.
  //  *
  //  * @param attributes the attributes that will be added.
  //  *                   null or undefined attribute values
  //  *                   are invalid and will result in undefined behavior.
  //  */
  // setAttributes(attributes: SpanAttributes): this;

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

module.exports = {
  OTelSpan
}
