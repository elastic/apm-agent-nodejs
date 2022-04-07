'use strict'

const api = require('@opentelemetry/api')

const { OTelSpan } = require('./OTelSpan')

// Implements interface Tracer from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/trace/tracer.ts
class ElasticTracer {
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
  // XXX either prefix all enode vars with 'el' or prefix all otel with 'otel'. The latter.
  startSpan (name, options = {}, context = api.context.active()) {
    console.log('XXX OTelTracer.startSpan(name=%s, options=%j, context=%s', name, options, context)
    // XXX handle agent being disabled
    // XXX handle spanContext.isRemote() for distributed traces

    // HERE This needs to get an appropriate `childOf` out of `context`.
    // The equiv of this in OTel-speak:
    //      const parentSpanContext = api.trace.getSpanContext(context);
    // which calls: `getSpan(context)?.spanContext();`.

    const currTrans = context.currTransaction()
    let spanOrTrans
    if (options.root || !currTrans) {
      spanOrTrans = this._ins.createTransaction(name) // XXX args
    } else {
      spanOrTrans = currTrans.createSpan(name) // XXX args
    }
    if (!spanOrTrans) {
      throw new Error('XXX how to handle null createSpan?')
    }

    const otelSpan = new OTelSpan(spanOrTrans)
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

    // For when we can't create a span the Java impl creates an "invalid" Span.
    // The oteljsapi changelog has:
    // - [#46](https://github.com/open-telemetry/opentelemetry-js-api/issues/46)
    //   Noop classes and singletons are no longer exported. To create a noop
    //   span it is recommended to use `api.trace.wrapSpanContext` with
    //   `INVALID_SPAN_CONTEXT` instead of using the `NOOP_TRACER`.
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
  ElasticTracer
}
