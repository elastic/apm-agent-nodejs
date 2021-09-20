'use strict'

throw new Error('XXX y u use async-hooks.js?')
/*

const asyncHooks = require('async_hooks')
const shimmer = require('./shimmer')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({ init, before, destroy })
  const activeSpans = new Map()
  const activeTransactions = new Map()
  let contexts = new WeakMap()

  Object.defineProperty(ins, 'currentTransaction', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return activeTransactions.get(asyncId) || null
    },
    set (trans) {
      const asyncId = asyncHooks.executionAsyncId()
      if (trans) {
        activeTransactions.set(asyncId, trans)
      } else {
        activeTransactions.delete(asyncId)
      }
    }
  })

  Object.defineProperty(ins, 'activeSpan', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return activeSpans.get(asyncId) || null
    },
    set (span) {
      const asyncId = asyncHooks.executionAsyncId()
      if (span) {
        activeSpans.set(asyncId, span)
      } else {
        activeSpans.delete(asyncId)
      }
    }
  })

  shimmer.wrap(ins, 'addEndedTransaction', function (addEndedTransaction) {
    return function wrappedAddEndedTransaction (transaction) {
      const asyncIds = contexts.get(transaction)
      if (asyncIds) {
        for (const asyncId of asyncIds) {
          activeTransactions.delete(asyncId)
          activeSpans.delete(asyncId)
        }
        contexts.delete(transaction)
      }

      return addEndedTransaction.call(this, transaction)
    }
  })

  shimmer.wrap(ins, 'stop', function (origStop) {
    return function wrappedStop () {
      asyncHook.disable()
      activeTransactions.clear()
      activeSpans.clear()
      contexts = new WeakMap()
      shimmer.unwrap(ins, 'addEndedTransaction')
      shimmer.unwrap(ins, 'stop')
      return origStop.call(this)
    }
  })

  asyncHook.enable()

  function init (asyncId, type, triggerAsyncId, resource) {
    // We don't care about the TIMERWRAP, as it will only init once for each
    // timer that shares the timeout value. Instead we rely on the Timeout
    // type, which will init for each scheduled timer.
    if (type === 'TIMERWRAP') return

    const transaction = ins.currentTransaction
    if (!transaction) return

    activeTransactions.set(asyncId, transaction)

    // Track the context by the transaction
    let asyncIds = contexts.get(transaction)
    if (!asyncIds) {
      asyncIds = []
      contexts.set(transaction, asyncIds)
    }
    asyncIds.push(asyncId)

    const span = ins.bindingSpan || ins.activeSpan
    if (span) activeSpans.set(asyncId, span)
  }

  function before (asyncId) {
    ins.bindingSpan = null
  }

  function destroy (asyncId) {
    const span = activeSpans.get(asyncId)
    const transaction = span ? span.transaction : activeTransactions.get(asyncId)

    if (transaction) {
      const asyncIds = contexts.get(transaction)
      if (asyncIds) {
        const index = asyncIds.indexOf(asyncId)
        asyncIds.splice(index, 1)
      }
    }

    activeTransactions.delete(asyncId)
    activeSpans.delete(asyncId)
  }
}

XXX rm async-hooks.js
*/
