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
    // This equiv is this:
    //      const parentSpanContext = api.trace.getSpanContext(context);
    // which calls: `getSpan(context)?.spanContext();`.
    // `getSpan(context)` looks up with the private SPAN_KEY.
    // It would be cheating to use that SPAN_KEY ourselves, so can we just use
    // the OTelContext object without it updating its cached RunContext instance?
    // This is fine because OTelContext is immutable, we'd need a new lazily-created
    // RunContext everytime anyway. So gut-feeling is this can work.
    //
    // I don't have a feel for OTelContext vs RunContent for mix of OTel API
    // (user code, or eventually OTel instrumentations) and our API (possibly
    // crazy user code using both APIs, or typically our instrumentations).
    //
    // A concern with the mix is that the internal `runContext.enterSpan(span)`
    // carries the trans and spans to the new RunContext instance, but may
    // lose OTelContext key/values. I'm not sure what Context keys *are*
    // important here:
    // - SPAN_KEY is not
    // - BAGGAGE_KEY perhaps?
    // - SUPPRESS_TRACING_KEY in opentelemetry-core/src/trace/suppress-tracing.ts?
    // - RPC_METADATA_KEY in opentelemetry-core/src/trace/rpc-metadata.ts
    // - any user usage that uses it for context prop carrying vars.
    //
    // ^^ So we are back to considering adding support to RunContext to impl
    // interface Context to carry `createContextKey()`-created metadata fwd.
    // I think that is straightforward. (TODO: test for this) Is this something
    // the Kibana guys would consider using for their executionContext prop?
    // TODO: how? HERE
    //  - RunContext.enterSpan() needs to copy these keys fwd
    //  - RunContext grows the {set,get,delete}Value() methods.
    //  - What happens with api.trace.setSpan(context, span)??? I don't know. :/
    //    The *cheat* that feels right is to have `setValue(SPAN_KEY, otelSpan)`
    //    redirect to `.enterSpan(span)`. But we'd need a bridge/sub-class for
    //    that, so not sure that is copacetic. And round we go.
    //  - How about the OTelContext is cached on the RunContext. RunContext.enterSpan()
    //    knows to carry that cached value to a _parentOtelContext. If later we
    //    come to create an OTelContext from this new RunContext, we can inherit
    //    the runContext._parentOTelContextFields or whatever. This sounds
    //    like dirty design.
    //
    // ... thinking more (notes in black journal p155-156), two options/stages:
    // 1. Track otelContext and runContext separately, but map between then with
    //    two WeakMaps (or with one WeakMap and an attribute on the other).
    //    I believe a WeakMap is necessary to avoid circular refs which can't
    //    be GC'd. Intercept the otelContext.setValue(SPAN_KEY, span) to
    //    update the runContext as appropriate. Limitation: This cannot carry
    //    other set values on otelContext. They get lost on Elastic APM API
    //    context changes (e.g. in our instrumentations). This is a start, tho.
    // 2. Add support for a RunContext subclass to be provided for internal
    //    context mgmt: class OTelBridgeRunContext extends RunContext.
    //
    // TODOs:
    // - Implement OTelContext interface Context. I'm not sure if it should take a RunContext.
    //   Perhaps a separate static method .fromRunContext() if JS supported, else a helper method
    //   for that.
    // - Implement OTelContextManager.with() and .active(). I'm not yet fully confident on
    //   the WeakMap caching of RunContext <=> OTelContext is yet here.

    const runContext = context._runContext
    console.log('XXX runContext: %s', runContext)

    const currTrans = runContext.currTransaction()
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
