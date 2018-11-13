'use strict'

const asyncHooks = require('async_hooks')
const shimmer = require('./shimmer')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({ init, destroy })
  const transactions = new Map()
  const contexts = new WeakMap()

  shimmer.wrap(ins, 'addEndedTransaction', function (addEndedTransaction) {
    return function wrappedAddEndedTransaction (transaction) {
      if (contexts.has(transaction)) {
        for (let asyncId of contexts.get(transaction)) {
          if (transactions.has(asyncId)) {
            transactions.delete(asyncId)
          }
        }
        contexts.delete(transaction)
      }
      return addEndedTransaction.call(this, transaction)
    }
  })

  Object.defineProperty(ins, 'currentTransaction', {
    get () {
      const asyncId = asyncHooks.executionAsyncId()
      return transactions.has(asyncId) ? transactions.get(asyncId) : null
    },
    set (trans) {
      const asyncId = asyncHooks.executionAsyncId()
      transactions.set(asyncId, trans)
    }
  })

  asyncHook.enable()

  function init (asyncId, type, triggerAsyncId, resource) {
    // We don't care about the TIMERWRAP, as it will only init once for each
    // timer that shares the timeout value. Instead we rely on the Timeout
    // type, which will init for each scheduled timer.
    if (type === 'TIMERWRAP') return

    var transaction = ins.currentTransaction
    if (!transaction) return

    transactions.set(asyncId, transaction)

    // Track the context by the transaction
    if (!contexts.has(transaction)) {
      contexts.set(transaction, [])
    }
    contexts.get(transaction).push(asyncId)
  }

  function destroy (asyncId) {
    if (!transactions.has(asyncId)) return // in case type === TIMERWRAP

    var transaction = transactions.get(asyncId)

    if (contexts.get(transaction)) {
      var list = contexts.get(transaction)
      var index = list.indexOf(asyncId)
      list.splice(index, 1)
    }

    transactions.delete(asyncId)
  }
}
