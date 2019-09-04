'use strict'

const withAgent = !!process.env.AGENT

module.exports = function (name, { agentConf, ...benchConf }) {
  let agent

  if (withAgent) {
    agent = require('../../..').start(Object.assign({
      serviceName: 'test',
      centralConfig: false,
      captureExceptions: false,
      captureSpanStackTraces: false,
      metricsInterval: 0
    }, agentConf))
  }

  const Benchmark = require('benchmark')

  new Benchmark(Object.assign({
    name: `${name} (${withAgent ? 'With Agent' : 'Without Agent'})`,
    defer: true,
    onStart () {
      // Prepare properties that need to be accessible inside the benchmark
      // test code. These can be accessed via `this.benchmark.*` from within
      // either the `setup` function or the `fn` function (as the regular
      // Node.js globals like `require` and `__filename` are not available to
      // those functions).
      this.agent = agent
      this.callstack = require('./callstack')
      this.fs = require('fs')
      this.testFile = __filename
    },
    onComplete (result) {
      console.error(this.toString())
      process.stdout.write(JSON.stringify({
        name: name,
        count: result.target.count,
        cycles: result.target.cycles,
        hz: result.target.hz,
        stats: result.target.stats,
        times: result.target.times
      }))
      process.exit()
    }
  }, benchConf)).run()
}
