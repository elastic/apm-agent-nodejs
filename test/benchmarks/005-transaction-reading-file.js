'use strict'

process.on('SIGUSR2', end)

const benchName = 'transaction'

let agent
if (process.env.AGENT) {
  agent = require('../../').start({
    serviceName: benchName,
    captureExceptions: false,
    captureSpanStackTraces: false,
    metricsInterval: 0
  })
}

const fs = require('fs')

let start
let stop = false
const pid = process.argv[2]
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

  if (pid) process.kill(pid, 'SIGUSR2')
  metrics.transactions = 0
  start = process.hrtime()

  // actual benchmark
  addTransaction('benchmark', function runAgain () {
    addTransaction('benchmark', runAgain)
  })
})

function addTransaction (name, cb) {
  if (stop) return
  if (agent) agent.startTransaction(name)
  readFile(() => {
    if (agent) agent.endTransaction()
    metrics.transactions++
    setImmediate(cb)
  })
}

function readFile (cb) {
  fs.readFile(__filename, err => {
    if (err) throw err
    cb()
  })
}

function end () {
  const duration = process.hrtime(start)
  stop = true
  if (agent) {
    console.error('Flushing...')
    agent.flush(function () {
      setTimeout(shutdown.bind(null, duration), 100)
    })
  } else {
    shutdown(duration)
  }
}

function shutdown (duration) {
  if (pid) process.kill(pid, 'SIGUSR2')
  process.stdout.write(JSON.stringify({
    name: benchName,
    warmup: { count: warmup, unit: 'transactions' },
    duration,
    metrics
  }))
  process.exit()
}
