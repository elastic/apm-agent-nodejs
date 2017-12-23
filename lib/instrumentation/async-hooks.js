'use strict'

const asyncHooks = require('async_hooks')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({init, destroy})
  const transactions = new Map()

  Object.defineProperty(ins, 'currentTransaction', {
    get: function () {
      const asyncId = asyncHooks.executionAsyncId()
      return transactions.has(asyncId) ? transactions.get(asyncId) : null
    },
    set: function (trans) {
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

    transactions.set(asyncId, ins.currentTransaction)
  }

  function destroy (asyncId) {
    if (!transactions.has(asyncId)) return // in case type === TIMERWRAP
    transactions.delete(asyncId)
  }
}
