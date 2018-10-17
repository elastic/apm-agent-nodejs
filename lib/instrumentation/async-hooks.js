'use strict'

const asyncHooks = require('async_hooks')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({ init, before, destroy })

  const activeTransactions = new Map()
  Object.defineProperty(ins, 'currentTransaction', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return activeTransactions.has(asyncId) ? activeTransactions.get(asyncId) : null
    },
    set (trans) {
      const asyncId = asyncHooks.executionAsyncId()
      activeTransactions.set(asyncId, trans)
    }
  })

  const activeSpans = new Map()
  Object.defineProperty(ins, 'activeSpan', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return activeSpans.has(asyncId) ? activeSpans.get(asyncId) : null
    },
    set (span) {
      const asyncId = asyncHooks.executionAsyncId()
      activeSpans.set(asyncId, span)
    }
  })

  asyncHook.enable()

  function init (asyncId, type, triggerAsyncId, resource) {
    // We don't care about the TIMERWRAP, as it will only init once for each
    // timer that shares the timeout value. Instead we rely on the Timeout
    // type, which will init for each scheduled timer.
    if (type === 'TIMERWRAP') return

    activeTransactions.set(asyncId, ins.currentTransaction)
    activeSpans.set(asyncId, ins.bindingSpan || ins.activeSpan)
  }

  function before (asyncId) {
    ins.bindingSpan = null
  }

  function destroy (asyncId) {
    // in case type === TIMERWRAP
    if (activeTransactions.has(asyncId)) {
      activeTransactions.delete(asyncId)
    }
    if (activeSpans.has(asyncId)) {
      activeSpans.delete(asyncId)
    }
  }
}
