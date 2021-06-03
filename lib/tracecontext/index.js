'use strict'
const TraceParent = require('traceparent')
const TraceState = require('./tracestate')
const { Baggage } = require('./baggage')

class TraceContext {
  constructor (traceparent, tracestate, baggage) {
    this.traceparent = traceparent
    this.tracestate = tracestate
    this.baggage = baggage
  }

  static startOrResume (childOf, conf, tracestateString, baggageString) {
    if (childOf && childOf._context instanceof TraceContext) return childOf._context.child()
    const traceparent = TraceParent.startOrResume(childOf, conf)
    const tracestate = TraceState.fromStringFormatString(tracestateString)
    let baggage
    try {
      baggage = new Baggage(baggageString)
    } catch (err) {
      console.warn('XXX invalid baggageString, dropping it on the floor:' + baggageString)
      baggage = new Baggage() // empty
    }

    // if a root transaction/span, set the initial sample rate in the tracestate

    if (!childOf && traceparent.recorded) {
      // if this is a sampled/recorded transaction, set the rate
      tracestate.setValue('s', conf.transactionSampleRate)
    } else if (!childOf) {
      // if this is a un-sampled/unreocrded transaction, set the
      // rate to zero, per the spec
      //
      // https://github.com/elastic/apm/blob/master/specs/agents/tracing-sampling.md
      tracestate.setValue('s', 0)
    }

    return new TraceContext(traceparent, tracestate, baggage)
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
      childTraceParent, this.tracestate, this.baggage
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

  toBaggageString () {
    return this.baggage.toString()
  }
}

TraceContext.FLAGS = TraceParent.FLAGS

module.exports = TraceContext
