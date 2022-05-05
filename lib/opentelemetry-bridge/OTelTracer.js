'use strict'

const otel = require('@opentelemetry/api')

const osdklog = require('./osdklog')
const { OTelBridgeRunContext } = require('./OTelBridgeRunContext')
const { OTelSpan } = require('./OTelSpan')
const Transaction = require('../instrumentation/transaction')
const { OTelBridgeNonRecordingSpan } = require('./OTelBridgeNonRecordingSpan')
const {
  epochMsFromOTelTimeInput,
  otelSpanContextFromTraceContext,
  traceparentStrFromOTelSpanContext
} = require('./otelutils')
const { OUTCOME_UNKNOWN } = require('../constants')

// Implements interface Tracer from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/trace/tracer.ts
class OTelTracer {
  constructor (agent) {
    this._agent = agent
    this._ins = agent._instrumentation
  }

  /**
   * Starts a new {@link Span}. Start the span without setting it on context.
   *
   * This method do NOT modify the current Context.
   *
   * @param name The name of the span
   * @param [options] SpanOptions used for span creation
   * @param [context] Context to use to extract parent
   * @returns Span The newly created span
   * @example
   *     const span = tracer.startSpan('op');
   *     span.setAttribute('key', 'value');
   *     span.end();
   */
  startSpan (name, otelSpanOptions = {}, otelContext = otel.context.active()) {
    osdklog.apicall('OTelTracer.startSpan(name=%s, options=%j, context=%s)', name, otelSpanOptions, otelContext)

    // Get the parent info for the new span.
    // We want to get a core Transaction or Span as a parent, when possible,
    // because that is required to support the span compression feature.
    let parentGenericSpan
    let parentOTelSpanContext
    if (otelSpanOptions.root) {
      // Pass through: explicitly want no parent.
    } else if (otelContext instanceof OTelBridgeRunContext) {
      parentGenericSpan = otelContext.currSpan() || otelContext.currTransaction()
      if (parentGenericSpan instanceof OTelBridgeNonRecordingSpan) {
        // This isn't a real Transaction we can use. It is a placeholder
        // to propagate its SpanContext. Grab just that.
        parentOTelSpanContext = parentGenericSpan.spanContext()
        parentGenericSpan = null
      }
    } else {
      // `otelContext` is any object that is meant to satisfy `interface
      // Context`. This may hold an OTel `SpanContext` that should be
      // propagated.
      parentOTelSpanContext = otel.trace.getSpanContext(otelContext)
    }

    // Create the new Span/Transaction.
    let newTransOrSpan = null
    if (parentGenericSpan) {
      // New child span.
      // XXX a test case where this `trans` is *not* the currentTrans would be interesting
      // XXX a separate test case where the trans is the same, but currentSpan isn't
      const trans = parentGenericSpan instanceof Transaction ? parentGenericSpan : parentGenericSpan.transaction
      const spanOpts = {
        childOf: parentGenericSpan
      }
      if (otelSpanOptions.startTime) {
        spanOpts.startTime = epochMsFromOTelTimeInput(otelSpanOptions.startTime)
      }
      newTransOrSpan = trans.createSpan(name, spanOpts)

      // There might be no span, e.g. if transactionMaxSpans was hit. We have
      // to return some OTelSpan, and we also want to propagate the parent's
      // trace-context, if any.
      if (!newTransOrSpan) {
        return otel.trace.wrapSpanContext(otelSpanContextFromTraceContext(parentGenericSpan._context))
      }
    } else if (parentOTelSpanContext && otel.isSpanContextValid(parentOTelSpanContext)) {
      // New continuing transaction.
      // XXX What about `isRemote`? Is that ever relevant outside of @opentelemetry/sdk?
      //    - I *think* the Java agent is saying "this new span has no parent"
      //      for this case: https://github.com/elastic/apm-agent-java/pull/1631/files#diff-df20e823985c8cdbae4e022b11ad6d010e174f83d19177f4e4a337ee61f35390R69-R78
      //      If the span in the context is not remote and isn't instanceof OTelSpan,
      //      then `parent` stays null. ... then in `startSpan()` it uses
      //      whatever the current active span is.
      //      Q: Is that correct? Can I come up with a code counter-example?
      const transOpts = {
        childOf: traceparentStrFromOTelSpanContext(parentOTelSpanContext)
      }
      if (parentOTelSpanContext.traceState) {
        transOpts.tracestate = parentOTelSpanContext.traceState.serialize()
      }
      if (otelSpanOptions.startTime !== undefined) {
        transOpts.startTime = epochMsFromOTelTimeInput(otelSpanOptions.startTime)
      }
      newTransOrSpan = this._ins.createTransaction(name, transOpts)
    } else {
      // New root transaction.
      const transOpts = otelSpanOptions.startTime === undefined
        ? {}
        : { startTime: epochMsFromOTelTimeInput(otelSpanOptions.startTime) }
      newTransOrSpan = this._ins.createTransaction(name, transOpts)
    }

    newTransOrSpan._setOTelKind(otel.SpanKind[otelSpanOptions.kind || otel.SpanKind.INTERNAL])

    // Explicitly use the higher-priority user outcome API to prevent the agent
    // inferring the outcome from any reported errors or HTTP status code.
    newTransOrSpan.setOutcome(OUTCOME_UNKNOWN)

    const otelSpan = new OTelSpan(newTransOrSpan)
    otelSpan.setAttributes(otelSpanOptions.attributes)

    return otelSpan
  }

  // startActiveSpan(name[, options[, context]], fn)
  //
  // Interface: https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/trace/tracer.ts#L41
  // Adapted from: https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/Tracer.ts
  startActiveSpan (name, otelSpanOptions, otelContext, fn) {
    osdklog.apicall('OTelTracer.startActiveSpan(name=%s, options=%j, context=%s, fn)', name, otelSpanOptions, otelContext)

    if (arguments.length < 2) {
      return
    } else if (arguments.length === 2) {
      fn = otelSpanOptions
      otelSpanOptions = undefined
      otelContext = undefined
    } else if (arguments.length === 3) {
      fn = otelContext
      otelContext = undefined
    }

    const parentContext = otelContext || otel.context.active()
    const span = this.startSpan(name, otelSpanOptions, parentContext)
    const contextWithSpanSet = otel.trace.setSpan(parentContext, span)

    return otel.context.with(contextWithSpanSet, fn, undefined, span)
  }
}

module.exports = {
  OTelTracer
}
