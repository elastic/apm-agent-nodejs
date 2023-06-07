/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const http = require('http')

const express = require('express')
const queue = require('express-queue')
const test = require('tape')

const mockClient = require('../../_mock_http_client')
const findObjInArray = require('../../_utils').findObjInArray

test('express-queue', function (t) {
  resetAgent(done(t, 'done'))

  const app = express()
  app.use(queue({ activeLimit: 1, queuedLimit: -1 }))
  app.get('/', function (req, res) {
    setImmediate(function () {
      const span = agent.startSpan('foo', 'bar')
      setImmediate(function () {
        if (span) span.end()
        res.end('done')
      })
    })
  })

  var server = app.listen(function () {
    const port = server.address().port
    const path = '/'

    const tasks = []
    for (let i = 0; i < 5; i++) {
      tasks.push(request(port, path))
    }

    Promise.all(tasks).then(done, done)

    function done () {
      agent.flush()
      server.close()
    }
  })
})

function request (port, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'GET',
      port: port,
      path: path,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    const req = http.request(opts, function (res) {
      const chunks = []
      res.on('error', reject)
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        resolve(Buffer.concat(chunks).toString())
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function done (t, query) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 5)

    data.transactions.forEach(function (trans, i) {
      t.comment('request ' + (i + 1))
      t.strictEqual(trans.name, 'GET /', 'name should be GET /')
      t.strictEqual(trans.type, 'request', 'type should be request')
      t.strictEqual(data.spans.filter(span => span.transaction_id === trans.id).length, 1, 'transaction should have 1 span')
      const span = findObjInArray(data.spans, 'transaction_id', trans.id)
      t.strictEqual(span.name, 'foo', 'span name should be foo')
      t.strictEqual(span.type, 'bar', 'span name should be bar')

      const offset = span.timestamp - trans.timestamp
      t.ok(offset + span.duration * 1000 < trans.duration * 1000, 'span should have valid timings')
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(10, cb)
  agent.captureError = function (err) { throw err }
}
