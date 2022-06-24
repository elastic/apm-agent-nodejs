/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const { AsyncLocalStorage } = require('async_hooks')

const { BasicRunContextManager } = require('./BasicRunContextManager')

// (Adapted from https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts)
class AsyncLocalStorageRunContextManager extends BasicRunContextManager {
  constructor (log, runContextClass) {
    super(log, runContextClass)
    this._asyncLocalStorage = new AsyncLocalStorage()
  }

  // A string representation useful for debug logging. For example,
  //    AsyncLocalStorageRunContextManager( RC(Trans(685ead, manual), [Span(9dd31c, GET httpstat.us, ended)]) )
  toString () {
    return `${this.constructor.name}( ${this.active().toString()} )`
  }

  enable () {
    super.enable() // XXX eventually drop
    return this
  }

  disable () {
    super.disable() // XXX eventually drop
    this._asyncLocalStorage.disable()
    return this
  }

  // Reset state for re-use of this context manager by tests in the same process.
  // XXX perhaps have this on the Abtract... base class?
  testReset () {
    this.disable()
    this.enable()
  }

  active () {
    const store = this._asyncLocalStorage.getStore()
    if (store == null) {
      return this._root
    } else {
      return store
    }
  }

  with (runContext, fn, thisArg, ...args) {
    const cb = thisArg == null ? fn : fn.bind(thisArg)
    return this._asyncLocalStorage.run(runContext, cb, ...args)
  }

  // This public method is needed to support the semantics of
  // apm.startTransaction() and apm.startSpan() that impact the current run
  // context.
  //
  // Otherwise, all run context changes are via `.with()` -- scoped to a
  // function call -- or via the "before" async hook -- scoped to an async task.
  supersedeRunContext (runContext) {
    // XXX I think there may be semantics issues here that breaks using a
    //     a stack of run contexts in a single sync task. We shall see.
    this._asyncLocalStorage.enterWith(runContext)
  }
}

module.exports = {
  AsyncLocalStorageRunContextManager
}
