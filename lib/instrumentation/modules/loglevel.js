'use strict'

var shimmer = require('../shimmer')

var logMethods = [
  'trace',
  'debug',
  'info',
  'warn',
  'error'
]

module.exports = function (loglevel, agent, { version }) {
  var ins = agent._instrumentation

  shimmer.massWrap(loglevel, logMethods, (original) => {
    return function (...args) {
      const current = ins.currentSpan || ins.currentTransaction
      args.unshift(current.toString())
      return original.apply(this, args)
    }
  })

  return loglevel
}
