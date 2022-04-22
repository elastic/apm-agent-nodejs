'use strict'

const otel = require('@opentelemetry/api')

const osdklog = require('./osdklog')
const { OTelBridgeRunContext } = require('./OTelBridgeRunContext')
const { OTelSpan } = require('./OTelSpan')
const Transaction = require('../instrumentation/transaction')
const { OTelBridgeNonRecordingSpan } = require('./OTelBridgeNonRecordingSpan')
const { epochMsFromOTelTimeInput } = require('./otelutils')

// Convert an OTel SpanContext to a traceparent string.
//
// Adapted from W3CTraceContextPropagator in @opentelemetry/core.
// https://github.com/open-telemetry/opentelemetry-js/blob/83355af4999c2d1ca660ce2499017d19642742bc/packages/opentelemetry-core/src/trace/W3CTraceContextPropagator.ts#L83-L85
function traceparentStrFromSpanContext (spanContext) {
  return `00-${spanContext.traceId}-${
    spanContext.spanId
  }-0${Number(spanContext.traceFlags || otel.TraceFlags.NONE).toString(16)}`
}

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
    // XXX handle agent being disabled: If disabled, this class should never get used, right?

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
        childOf: traceparentStrFromSpanContext(parentOTelSpanContext)
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
      // XXX This doesn't correctly select *no* parent. How do we explicitly pass that in? childOf:null?
      newTransOrSpan = this._ins.createTransaction(name, transOpts)
    }

    if (!newTransOrSpan) {
      // XXX Do we do a NonRecordingSpan here? TODO: see if that is what works with OTel
      //
      // For when we can't create a span the Java impl creates an "invalid" Span.
      // The oteljsapi changelog has:
      // - [#46](https://github.com/open-telemetry/opentelemetry-js-api/issues/46)
      //   Noop classes and singletons are no longer exported. To create a noop
      //   span it is recommended to use `otel.trace.wrapSpanContext` with
      //   `INVALID_SPAN_CONTEXT` instead of using the `NOOP_TRACER`.
      //
      // Note that the equivalent case from opentelemetry-sdk-trace-base/src/Tracer.ts is:
      //     return api.trace.wrapSpanContext(spanContext);
      // IOW, it is propagating that spanContext.
      // XXX Consider a test case where we hit no span because transaction_max_spans,
      //     but see if a subsequent outgoing http request can still propagate traceparent et al.
      throw new Error('XXX NYI')
    }

    // XXX trans.setFrameworkName that ejava is doing?
    // https://github.com/elastic/apm-agent-java/pull/1631/files#diff-df20e823985c8cdbae4e022b11ad6d010e174f83d19177f4e4a337ee61f35390R164

    newTransOrSpan._setOTelKind(otel.SpanKind[otelSpanOptions.kind || otel.SpanKind.INTERNAL])

    const otelSpan = new OTelSpan(newTransOrSpan)
    otelSpan.setAttributes(otelSpanOptions.attributes)

    return otelSpan
  }

  /**
   * Starts a new {@link Span} and calls the given function passing it the
   * created span as first argument.
   * Additionally the new span gets set in context and this context is activated
   * for the duration of the function call.
   *
   * @param name The name of the span
   * @param [options] SpanOptions used for span creation
   * @param [context] Context to use to extract parent
   * @param fn function called in the context of the span and receives the newly created span as an argument
   * @returns return value of fn
   * @example
   *     const something = tracer.startActiveSpan('op', span => {
   *       try {
   *         do some work
   *         span.setStatus({code: SpanStatusCode.OK});
   *         return something;
   *       } catch (err) {
   *         span.setStatus({
   *           code: SpanStatusCode.ERROR,
   *           message: err.message,
   *         });
   *         throw err;
   *       } finally {
   *         span.end();
   *       }
   *     });
   *
   * @example
   *     const span = tracer.startActiveSpan('op', span => {
   *       try {
   *         do some work
   *         return span;
   *       } catch (err) {
   *         span.setStatus({
   *           code: SpanStatusCode.ERROR,
   *           message: err.message,
   *         });
   *         throw err;
   *       }
   *     });
   *     do some more work
   *     span.end();
   */
  // startActiveSpan<F extends (span: Span) => unknown>(
  //   name: string,
  //   fn: F
  // ): ReturnType<F>;
  // startActiveSpan<F extends (span: Span) => unknown>(
  //   name: string,
  //   options: SpanOptions,
  //   fn: F
  // ): ReturnType<F>;
  // startActiveSpan<F extends (span: Span) => unknown>(
  //   name: string,
  //   options: SpanOptions,
  //   context: Context,
  //   fn: F
  // ): ReturnType<F>;
}

module.exports = {
  OTelTracer
}
