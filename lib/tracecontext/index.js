'use strict'
const { TraceParent } = require('./traceparent')
const TraceState = require('./tracestate')

class TraceContext {
  constructor (traceparent, tracestate, conf = {}) {
    this.traceparent = traceparent
    this.tracestate = tracestate
    this._conf = conf
  }

  // Note: `childOf` can be a TraceContext, a TraceParent, or a thing with a
  // `._context` that is a TraceContext (e.g. GenericSpan).
  static startOrResume (childOf, conf, tracestateString) {
    if (childOf && childOf._context instanceof TraceContext) return childOf._context.child()
    const traceparent = TraceParent.startOrResume(childOf, conf)
    const tracestate = TraceState.fromStringFormatString(tracestateString)

    // if a root transaction/span, set the initial sample rate in the tracestate

    if (!childOf && traceparent.recorded) {
      // if this is a sampled/recorded transaction, set the rate
      tracestate.setValue('s', conf.transactionSampleRate)
    } else if (!childOf) {
      // if this is a un-sampled/unreocrded transaction, set the
      // rate to zero, per the spec
      //
      // https://github.com/elastic/apm/blob/main/specs/agents/tracing-sampling.md
      tracestate.setValue('s', 0)
    }

    return new TraceContext(traceparent, tracestate, conf)
  }

  static fromString (header) {
    return TraceParent.fromString(header)
  }

  ensureParentId () {
    return this.traceparent.ensureParentId()
  }

  child () {
    const childTraceParent = this.traceparent.child()
    const childTraceContext = new TraceContext(
      childTraceParent, this.tracestate, this._conf
    )
    return childTraceContext
  }

  /**
   * Returns traceparent string only
   *
   * @todo legacy -- can we remove to avoid confusion?
   */
  toString () {
    return this.traceparent.toString()
  }

  toTraceStateString () {
    return this.tracestate.toW3cString()
  }

  toTraceParentString () {
    return this.traceparent.toString()
  }

  propagateTraceContextHeaders (carrier, setter) {
    if (!carrier || !setter) {
      return
    }
    const traceparent = this.toTraceParentString()
    const tracestate = this.toTraceStateString()
    if (traceparent) {
      setter(carrier, 'traceparent', traceparent)
      if (this._conf.useElasticTraceparentHeader) {
        setter(carrier, 'elastic-apm-traceparent', traceparent)
      }
    }

    if (tracestate) {
      setter(carrier, 'tracestate', tracestate)
    }
  }
}

TraceContext.FLAGS = TraceParent.FLAGS

module.exports = TraceContext
