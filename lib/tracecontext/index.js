'use strict'
const TraceParent = require('traceparent')
const TraceState = require('./tracestate')

const definePassthroughProp = (objMe, objToPassTo, propName) => {
  // properties that call through to traceparent
  Object.defineProperty(objMe, propName, {
    configurable: true,
    enumerable: true,
    get () {
      return objToPassTo[propName]
    }
  })
}

class TraceContext {
  constructor (traceparent, tracestate) {
    this.traceparent = traceparent
    this.tracestate = tracestate

    definePassthroughProp(this, this.traceparent, 'recorded')
    definePassthroughProp(this, this.traceparent, 'version')
    definePassthroughProp(this, this.traceparent, 'traceId')
    definePassthroughProp(this, this.traceparent, 'id')
    definePassthroughProp(this, this.traceparent, 'flags')
    definePassthroughProp(this, this.traceparent, 'parentId')
  }

  static startOrResume (childOf, conf, tracestateString) {
    if (childOf && childOf._context instanceof TraceContext) return childOf._context.child()
    const traceparent = TraceParent.startOrResume(childOf, conf)
    const tracestate = TraceState.fromStringFormatString(tracestateString)
    tracestate.setValue('s', conf.transactionSampleRate)

    return new TraceContext(traceparent, tracestate)
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
      childTraceParent, this.tracestate
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
}

TraceContext.FLAGS = TraceParent.FLAGS

module.exports = TraceContext
