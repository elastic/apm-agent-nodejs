'use strict'

/* eslint-disable no-unused-vars, no-undef */

const bench = require('./utils/bench')

bench('transaction-and-span-with-stack-trace', {
  agentConf: {
    captureSpanStackTraces: true,
    spanFramesMinDuration: '-1ms'
  },
  setup () {
    var agent = this.benchmark.agent
  },
  fn (deferred) {
    if (agent) agent.startTransaction()
    setImmediate(() => {
      const span = agent && agent.startSpan()
      setImmediate(() => {
        if (agent) {
          span.end()
          agent.endTransaction()
        }
        deferred.resolve()
      })
    })
  }
})
