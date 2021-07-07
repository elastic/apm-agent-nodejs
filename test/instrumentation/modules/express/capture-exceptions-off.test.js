'use strict'

const agent = require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const { exec } = require('child_process')

const express = require('express')
const test = require('tape')

const mockClient = require('../../../_mock_http_client')

test('use given error handler middleware if captureExceptions: false', function (t) {
  t.plan(5)

  onAPMData(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')
  })

  const err = new Error('foo')

  const app = express()
  app.get('/', function (req, res) {
    throw err
  })
  app.use(function (_err, req, res, next) {
    t.strictEqual(_err, err)
    res.send('hello from error handler')
  })

  const server = app.listen(function () {
    get(server, (err, stdout, stderr) => {
      t.error(err)
      t.strictEqual(stdout, 'hello from error handler')
      t.strictEqual(stderr, '')
      server.close()
    })
  })
})

function get (server, cb) {
  // use curl instead of http.get so the agent doesn't try to track the outgoing request
  // -s: Silent mode. Don't output progress on stderr
  exec(`curl -s localhost:${server.address().port}`, cb)
}

function onAPMData (cb) {
  agent._transport = mockClient(1, cb)
}
