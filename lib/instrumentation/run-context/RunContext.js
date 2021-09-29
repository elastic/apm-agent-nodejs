'use strict'

// A RunContext is the immutable structure that holds which transaction and span
// are currently active, if any, for the running JavaScript code.
//
// Module instrumentation code interacts with run contexts via a number of
// methods on the `Instrumentation` instance at `agent._instrumentation`.
// For example `ins.bindFunction(fn)` binds `fn` to the current RunContext;
// `ins.startSpan(...)` creates a span and replaces the current RunContext
// to make the new span the current one; etc.  (Internally the Instrumentation
// has a `this._runCtxMgr` that manipulates RunContexts.)
//
// User code is not exposed to RunContexts. The Agent API, Transaction API,
// and Span API hide those details.
//
// A RunContext holds:
// - a current Transaction, which can be null; and
// - a *stack* of Spans, where the top-of-stack span is the "current" one.
//   A stack is necessary to support the semantics of multiple started and ended
//   spans in the same async task. E.g.:
//      apm.startTransaction('t')
//      var s1 = apm.startSpan('s1')
//      var s2 = apm.startSpan('s2')
//      s2.end()
//      assert(apm.currentSpan === s1, 's1 is now the current span')
//
// A RunContext is immutable. This means that `runContext.enterSpan(span)` and
// other similar methods return a new/separate RunContext instance. This is
// done so that a run-context change in the current code does not change
// anything for other code bound to the original RunContext (e.g. via
// `ins.bindFunction` or `ins.bindEmitter`).
//
// RunContext is roughly equivalent to OTel's `Context` interface in concept.
// https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/context/types.ts
class RunContext {
  constructor (trans, spans) {
    this._trans = trans || null
    this._spans = spans || []
  }

  currTransaction () {
    return this._trans
  }

  // Returns the currently active span, if any, otherwise null.
  currSpan () {
    if (this._spans.length > 0) {
      return this._spans[this._spans.length - 1]
    } else {
      return null
    }
  }

  // Return a new RunContext with the given span added to the top of the spans
  // stack.
  enterSpan (span) {
    const newSpans = this._spans.slice()
    newSpans.push(span)
    return new RunContext(this._trans, newSpans)
  }

  // Return a new RunContext with the given span removed, or null if there is
  // no change (the given span isn't part of the run context).
  //
  // Typically this span is the top of stack (i.e. it is the current span).
  // However, it is possible to have out-of-order span.end() or even end a span
  // that isn't part of the current run context stack at all. (See
  // test/instrumentation/run-context/fixtures/end-non-current-spans.js for
  // examples.)
  exitSpan (span) {
    let newRc = null
    let newSpans
    const lastSpan = this._spans[this._spans.length - 1]
    if (lastSpan && lastSpan.id === span.id) {
      // Fast path for common case: `span` is top of stack.
      newSpans = this._spans.slice(0, this._spans.length - 1)
      newRc = new RunContext(this._trans, newSpans)
    } else {
      const stackIdx = this._spans.findIndex(s => s.id === span.id)
      if (stackIdx !== -1) {
        newSpans = this._spans.slice(0, stackIdx).concat(this._spans.slice(stackIdx + 1))
        newRc = new RunContext(this._trans, newSpans)
      }
    }
    return newRc
  }

  // A string representation useful for debug logging.
  // For example:
  //    RC(Trans(abc123, trans name), [Span(def456, span name, ended))
  //                                                         ^^^^^^^-- if the span has ended
  //             ^^^^^^                     ^^^^^^-- 6-char prefix of .id
  //       ^^^^^-- abbreviated Transaction
  //    ^^-- abbreviated RunContext
  toString () {
    const bits = []
    if (this._trans) {
      bits.push(`Trans(${this._trans.id.slice(0, 6)}, ${this._trans.name}${this._trans.ended ? ', ended' : ''})`)
    }
    if (this._spans.length > 0) {
      const spanStrs = this._spans.map(
        s => `Span(${s.id.slice(0, 6)}, ${s.name}${s.ended ? ', ended' : ''})`)
      bits.push('[' + spanStrs + ']')
    }
    return `RC(${bits.join(', ')})`
  }
}

module.exports = {
  RunContext
}
