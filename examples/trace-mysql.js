#!/usr/bin/env node --unhandled-rejections=strict

// A small example showing Elastic APM tracing of a script using `mysql`.
//
// By default this will use a MySQL on localhost with user 'root'. You can use:
//    npm run docker:start
// to start a MySQL container (and other containers used for testing of
// this project).

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-mysql'
})

const mysql = require('mysql')

const client = mysql.createConnection({
  user: process.env.MYSQL_USER || 'root'
})
client.connect(function (err) {
  console.warn('Connected (err=%s)', err)
})

// 1. Callback style
apm.startTransaction('t1')
client.query('SELECT 1 + 1 AS solution', (err, res) => {
  if (err) {
    console.log('[t1] Failure: err is', err)
  } else {
    console.log('[t1] Success: solution is %s', res[0].solution)
  }
  apm.endTransaction()
})

// 2. Event emitter style
const t2 = apm.startTransaction('t2')
const q = client.query('SELECT 1 + 1 AS solution')
q.on('error', function (err) {
  console.log('[t2] Failure: err is', err)
})
q.on('result', function (row) {
  console.log('[t2] solution is', row.solution)
})
q.on('end', function () {
  console.log('[t2] End')
  t2.end()
})

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done')
  client.end()
}, 1000)
