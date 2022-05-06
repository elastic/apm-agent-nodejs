'use strict'

// A RunContext is the immutable structure that holds which transaction and span
// are currently active, if any, for the running JavaScript code.
//
// Module instrumentation code interacts with run contexts via a number of
// methods on the `Instrumentation` instance at `agent._instrumentation`.
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
// XXX add values
//
// A RunContext is immutable. This means that `runContext.enterSpan(span)` and
// other similar methods return a new/separate RunContext instance. This is
// done so that a run-context change in the current code does not change
// anything for other code bound to the original RunContext (e.g. via
// `ins.bindFunction` or `ins.bindEmitter`).
//
// XXX Update this desc. Also warn this class shouldn't be used directly. Instead use _runCtxMgr._runContextClass? Or ... something public on it? -> _runCtxMgr.root() and build from there.
// RunContext is roughly equivalent to OTel's `Context` interface in concept.
// https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/context/types.ts
class RunContext {
  constructor (trans, spans, parentValues) {
    this._trans = trans || null
    this._spans = spans || []
    // XXX perf: How often are we creating RunContext's? If a lot, is there
    //    a perf win in avoiding this Map unless there is a setValue()?
    //    Because we expect `setValue()` to be rare: only for OTel SDK usage for now
    //    (and only for some edge case usage of the OTel SDK at that).
    //    TODO: some before/after pathosapp.js evaluation and profiles. Also CI Benchmarks.
    this._values = parentValues ? new Map(parentValues) : new Map()
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

  // Return a new RunContext for a newly active/current Transaction.
  enterTrans (trans) {
    return new this.constructor(trans, null, this._values)
  }

  // Return a new RunContext with the given span added to the top of the spans
  // stack.
  enterSpan (span) {
    const newSpans = this._spans.slice()
    newSpans.push(span)
    return new this.constructor(this._trans, newSpans, this._values)
  }

  // Return a new RunContext with the given transaction (and hence all of its
  // spans) removed.
  exitTrans () {
    // XXX rename to leaveTrans?
    return new this.constructor(null, null, this._values)
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
    // XXX rename to leaveSpan separately?
    let newRc = null
    let newSpans
    const lastSpan = this._spans[this._spans.length - 1]
    if (lastSpan && lastSpan.id === span.id) {
      // Fast path for common case: `span` is top of stack.
      newSpans = this._spans.slice(0, this._spans.length - 1)
      newRc = new this.constructor(this._trans, newSpans, this._values)
    } else {
      const stackIdx = this._spans.findIndex(s => s.id === span.id)
      if (stackIdx !== -1) {
        newSpans = this._spans.slice(0, stackIdx).concat(this._spans.slice(stackIdx + 1))
        newRc = new this.constructor(this._trans, newSpans, this._values)
      }
    }
    return newRc
  }

  // A string representation useful for debug logging.
  // For example:
  //    RunContext(Transaction(abc123, 'trans name'), [Span(def456, 'span name', ended)])
  //                                                                           ^^^^^^^-- if the span has ended
  //                           ^^^^^^                       ^^^^^^-- 6-char prefix of .id
  //               ^^^^^^^^^^^-- Transaction class name
  //    ^^^^^^^^^^-- the class name, typically "RunContext", but can be overriden
  toString () {
    const bits = []
    if (this._trans) {
      bits.push(`${this._trans.constructor.name}(${this._trans.id.slice(0, 6)}, '${this._trans.name}'${this._trans.ended ? ', ended' : ''})`)
    }
    if (this._spans.length > 0) {
      const spanStrs = this._spans.map(
        s => `Span(${s.id.slice(0, 6)}, '${s.name}'${s.ended ? ', ended' : ''})`)
      bits.push('[' + spanStrs + ']')
    }
    return `${this.constructor.name}<${bits.join(', ')}>`
  }

  // ---- The following implements the OTel Context interface.
  // https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L17

  getValue (key) {
    return this._values.get(key)
  }

  setValue (key, value) {
    const rc = new this.constructor(this._trans, this._spans, this._values)
    rc._values.set(key, value)
    return rc
  }

  deleteValue (key) {
    const rc = new this.constructor(this._trans, this._spans, this._values)
    rc._values.delete(key)
    return rc
  }
}

module.exports = {
  RunContext
}
