#!/usr/bin/env node --unhandled-rejections=strict

// A small example showing Elastic APM tracing of a script using `mysql`.

const apm = require('../').start({ // elastic-apm-node
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'example-trace-mysql'
})

const assert = require('assert')
const mysql = require('mysql')

const client = mysql.createConnection({
  user: process.env.MYSQL_USER || 'root'
})
client.connect(function (err) {
  console.warn('Connected (err=%s)', err)
})

// 1. Callback style
const t1 = apm.startTransaction('t1')
client.query('SELECT 1 + 1 AS solution', (err, res) => {
  if (err) {
    console.log('[t1] Failure: err is', err)
  } else {
    console.log('[t1] Success: solution is %s', res[0].solution)
  }
  assert(apm.currentTransaction === t1)
  apm.endTransaction()
})

// 2. Event emitter style
const t2 = apm.startTransaction('t2')
const q = client.query('SELECT 1 + AS solution')
q.on('error', function (err) {
  console.log('[t2] Failure: err is', err)
  assert(apm.currentTransaction === t2)
})
q.on('result', function (row) {
  console.log('[t2] solution is', row.solution)
  assert(apm.currentTransaction === t2)
})
q.on('end', function () {
  console.log('[t2] End')
  assert(apm.currentTransaction === t2)
  apm.endTransaction()
})

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done')
  client.end()
}, 1000)
