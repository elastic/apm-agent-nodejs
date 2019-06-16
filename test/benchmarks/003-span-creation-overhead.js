'use strict'

process.on('SIGUSR2', end)

let agent
if (process.env.AGENT) {
  agent = require('../../').start({
    serviceName: '003-span-creation-overhead',
    captureExceptions: false
  })
  // v1 no-ops
  if (agent._instrumentation._queue) {
    agent._instrumentation._queue.add = noop
  }
  // v2 no-ops
  if (agent._apmServer) {
    agent._apmServer.sendTransaction = noop
    agent._apmServer.sendSpan = noop
    agent._apmServer.sendError = noop
  }
}

let start
const warmup = 1e4
const runtime = 10
const metrics = {
  transactions: 0
}

// warmup
console.error('Warming up for %d transactions...', warmup)
addTransaction('warmup', function runAgain () {
  if (metrics.transactions < warmup) return addTransaction('warmup', runAgain)

  console.error('Running benchmark for %d seconds...', runtime)

  setTimeout(end, runtime * 1000)

  metrics.transactions = 0
  start = process.hrtime()

  // actual benchmark
  addTransaction('benchmark', function runAgain () {
    addTransaction('benchmark', runAgain)
  })
})

function addTransaction (name, cb) {
  if (agent) agent.startTransaction(name)
  addSpan(name, () => {
    if (agent) agent.endTransaction()
    metrics.transactions++
    setImmediate(cb)
  })
}

function addSpan (prefix, amount, cb) {
  if (typeof amount === 'function') return addSpan(prefix, 1, amount)
  setImmediate(() => {
    const span = agent && agent.startSpan(prefix + 'my-span', 'my-span-type')
    setImmediate(() => {
      if (agent) span.end()
      if (--amount === 0) cb()
      else addSpan(prefix, amount, cb)
    })
  })
}

function end () {
  const hrtime = process.hrtime(start)
  process.stdout.write(JSON.stringify({hrtime, metrics}))
  process.exit()
}

function noop () {}
