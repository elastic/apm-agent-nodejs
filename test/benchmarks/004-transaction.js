'use strict'

const bench = require('./utils/bench')

bench('transaction', {
  setup () {
    var agent = this.benchmark.agent
  },
  fn (deferred) {
    if (agent) agent.startTransaction()
    setImmediate(() => {
      if (agent) agent.endTransaction()
      setImmediate(() => {
        deferred.resolve()
      })
    })
  }
})
