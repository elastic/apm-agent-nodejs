'use strict'

const asyncHooks = require('async_hooks')
const shimmer = require('./shimmer')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({ init, destroy })
  const transactions = new Map()
  const contexts = new WeakMap()

  shimmer.wrap(ins, 'addEndedTransaction', function (addEndedTransaction) {
    return function wrappedAddEndedTransaction (transaction) {
      const asyncIds = contexts.get(transaction)
      if (asyncIds) {
        for (const asyncId of asyncIds) {
          transactions.delete(asyncId)
        }
        contexts.delete(transaction)
      }

      return addEndedTransaction.call(this, transaction)
    }
  })

  Object.defineProperty(ins, 'currentTransaction', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return transactions.get(asyncId) || null
    },
    set (trans) {
      const asyncId = asyncHooks.executionAsyncId()
      if (trans) {
        transactions.set(asyncId, trans)
      } else {
        transactions.delete(asyncId)
      }
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

    transactions.set(asyncId, transaction)

    // Track the context by the transaction
    let asyncIds = contexts.get(transaction)
    if (!asyncIds) {
      asyncIds = []
      contexts.set(transaction, asyncIds)
    }
    asyncIds.push(asyncId)
  }

  function destroy (asyncId) {
    const transaction = transactions.get(asyncId)

    if (!transaction) return

    const asyncIds = contexts.get(transaction)
    if (asyncIds) {
      const index = asyncIds.indexOf(asyncId)
      asyncIds.splice(index, 1)
    }

    transactions.delete(asyncId)
  }
}
