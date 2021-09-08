#!/usr/bin/env node --unhandled-rejections=strict
// A small example showing Elastic APM tracing of a script using `pg`
// (https://github.com/brianc/node-postgres).
//
// Expect:
//   transaction "t1"
//   `- span "SELECT"
//   transaction "t2"
//   `- span "SELECT"
//   transaction "t3"
//   `- span "SELECT"

const apm = require('../').start({ // elastic-apm-node
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'example-trace-pg'
})

const assert = require('assert')
const { Client, Query } = require('pg')

const client = new Client({
  user: process.env.PGUSER || 'postgres'
})
client.connect(function (err) {
  console.warn('Connected (err=%s)', err)
})

// 1. Callback style
const t1 = apm.startTransaction('t1')
client.query('SELECT $1::text as message', ['Hello world!'], (err, res) => {
  if (err) {
    console.log('[t1] Failure: err is', err)
  } else {
    console.log('[t1] Success: message is %s', res.rows[0].message)
  }
  assert(apm.currentTransaction === t1)
  apm.endTransaction()
})

// 2. Using streaming style, i.e. using a `Submittable` as node-postgres calls it.
const t2 = apm.startTransaction('t2')
var q = client.query(new Query('select 1 + 1 as solution'))
q.on('error', (err) => {
  console.log('[t2] Failure: err is', err)
  assert(apm.currentTransaction === t2)
  apm.endTransaction()
})
q.on('row', (row) => {
  console.log('[t2] solution is %s', row.solution)
  assert(apm.currentTransaction === t2)
})
q.on('end', () => {
  console.log('[t2] Success')
  assert(apm.currentTransaction === t2)
  apm.endTransaction()
})

// 3. Promise style
const t3 = apm.startTransaction('t3')
client.query('select 1 + 1 as solution')
  .then(function (result) {
    console.log('[t3] Success: solution is %s', result.rows[0].solution)
    assert(apm.currentTransaction === t3)
  })
  .catch(function (err) {
    console.log('[t3] Failure: err is', err)
    assert(apm.currentTransaction === t3)
  })
  .finally(function () {
    assert(apm.currentTransaction === t3)
    apm.endTransaction()
  })

// TODO: 4. async/await style

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done')
  client.end()
}, 1000)
