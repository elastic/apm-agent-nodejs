'use strict'

const asyncHooks = require('async_hooks')

module.exports = function (ins) {
  const asyncHook = asyncHooks.createHook({init, before, after, destroy})
  const initState = new Map()
  const beforeState = new Map()

  asyncHook.enable()

  function init (asyncId, type, triggerAsyncId, resource) {
    // We don't care about the TIMERWRAP, as it will only init once for each
    // timer that shares the timeout value. Instead we rely on the Timeout
    // type, which will init for each scheduled timer.
    if (type === 'TIMERWRAP') return

    initState.set(asyncId, ins.currentTransaction)
  }

  function before (asyncId) {
    if (!initState.has(asyncId)) return // in case type === TIMERWRAP
    beforeState.set(asyncId, ins.currentTransaction)
    ins.currentTransaction = initState.get(asyncId)
  }

  function after (asyncId) {
    if (!initState.has(asyncId)) return // in case type === TIMERWRAP
    ins.currentTransaction = beforeState.get(asyncId)
  }

  function destroy (asyncId) {
    if (!initState.has(asyncId)) return // in case type === TIMERWRAP
    initState.delete(asyncId)
    beforeState.delete(asyncId)
  }
}
