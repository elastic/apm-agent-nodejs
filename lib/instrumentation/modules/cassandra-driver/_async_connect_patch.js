'use strict'

module.exports = function (agent) {
  return function wrapAsyncConnect (original) {
    return async function wrappedAsyncConnect () {
      const span = agent.startSpan('Cassandra: Connect', 'db.cassandra.connect')
      try {
        return await original.apply(this, arguments)
      } finally {
        if (span) span.end()
      }
    }
  }
}
