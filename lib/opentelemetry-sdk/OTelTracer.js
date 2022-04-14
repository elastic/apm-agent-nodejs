'use strict'

const otel = require('@opentelemetry/api')

const { OTelBridgeRunContext } = require('./OTelBridgeRunContext')
const { OTelSpan } = require('./OTelSpan')
const Transaction = require('../instrumentation/transaction')
const { OTelBridgeNonRecordingSpan } = require('./OTelBridgeNonRecordingSpan')

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
  startSpan (name, options = {}, otelContext = otel.context.active()) {
    console.log('XXX OTelTracer.startSpan(name=%s, options=%j, context=%s)', name, options, otelContext)
    // XXX handle agent being disabled: If disabled, this class should never get used, right?

    // Get the parent info for the new span.
    // We want to get a core Transaction or Span as a parent, when possible,
    // because that is required to support the span compression feature.
    let parentGenericSpan
    let parentOTelSpanContext
    if (otelContext instanceof OTelBridgeRunContext) {
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
    // XXX options.root

    // Create the new Span/Transaction.
    let newTransOrSpan = null
    if (parentGenericSpan) {
      // New child span.
      // XXX a test case where this `trans` is *not* the currentTrans would be interesting
      // XXX a separate test case where the trans is the same, but currentSpan isn't
      const trans = parentGenericSpan instanceof Transaction ? parentGenericSpan : parentGenericSpan.transaction
      newTransOrSpan = trans.createSpan(name, { childOf: parentGenericSpan }) // XXX args, options.startTime
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
      newTransOrSpan = this._ins.createTransaction(name, transOpts) // XXX args, opts.startTime
    } else {
      // New root transaction.
      newTransOrSpan = this._ins.createTransaction(name) // XXX args, opts.startTime
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

    // XXX attributes, links, et al

    const otelSpan = new OTelSpan(newTransOrSpan)
    return otelSpan

    // XXX
    // Compare to /Users/trentm/all-otel/opentelemetry-js/packages/opentelemetry-sdk-trace-base/src/Tracer.ts
    // startSpan(
    //   name: string,
    //   options: api.SpanOptions = {},
    //   context = api.context.active()
    // ): api.Span {
    //   if (isTracingSuppressed(context)) {
    //     api.diag.debug('Instrumentation suppressed, returning Noop Span');
    //     return api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT);
    //   }

    //   // remove span from context in case a root span is requested via options
    //   if (options.root) {
    //     context = api.trace.deleteSpan(context);
    //   }

    //   const parentSpanContext = api.trace.getSpanContext(context);
    //   const spanId = this._idGenerator.generateSpanId();
    //   let traceId;
    //   let traceState;
    //   let parentSpanId;
    //   if (!parentSpanContext || !api.trace.isSpanContextValid(parentSpanContext)) {
    //     // New root span.
    //     traceId = this._idGenerator.generateTraceId();
    //   } else {
    //     // New child span.
    //     traceId = parentSpanContext.traceId;
    //     traceState = parentSpanContext.traceState;
    //     parentSpanId = parentSpanContext.spanId;
    //   }

    //   const spanKind = options.kind ?? api.SpanKind.INTERNAL;
    //   const links = options.links ?? [];
    //   const attributes = sanitizeAttributes(options.attributes);
    //   // make sampling decision
    //   const samplingResult = this._sampler.shouldSample(
    //     context,
    //     traceId,
    //     name,
    //     spanKind,
    //     attributes,
    //     links
    //   );

    //   const traceFlags =
    //     samplingResult.decision === api.SamplingDecision.RECORD_AND_SAMPLED
    //       ? api.TraceFlags.SAMPLED
    //       : api.TraceFlags.NONE;
    //   const spanContext = { traceId, spanId, traceFlags, traceState };
    //   if (samplingResult.decision === api.SamplingDecision.NOT_RECORD) {
    //     api.diag.debug('Recording is off, propagating context in a non-recording span');
    //     return api.trace.wrapSpanContext(spanContext);
    //   }

    //   const span = new Span(
    //     this,
    //     context,
    //     name,
    //     spanContext,
    //     spanKind,
    //     parentSpanId,
    //     links,
    //     options.startTime
    //   );
    //   // Set default attributes
    //   span.setAttributes(Object.assign(attributes, samplingResult.attributes));
    //   return span;
    // }
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

// Convert an OTel SpanContext to a traceparent string.
//
// Adapted from W3CTraceContextPropagator in @opentelemetry/core.
// https://github.com/open-telemetry/opentelemetry-js/blob/83355af4999c2d1ca660ce2499017d19642742bc/packages/opentelemetry-core/src/trace/W3CTraceContextPropagator.ts#L83-L85
function traceparentStrFromSpanContext (spanContext) {
  return `00-${spanContext.traceId}-${
    spanContext.spanId
  }-0${Number(spanContext.traceFlags || otel.TraceFlags.NONE).toString(16)}`
}

module.exports = {
  OTelTracer
}
