/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../../../..').start({
  serviceName: 'test-http-outgoing',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

const http = require('http')

const test = require('tape')

const mockClient = require('../../../_mock_http_client')

test('response writeHead is bound to transaction', function (t) {
  resetAgent(data => {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    const trans = data.transactions[0]
    t.strictEqual(trans.result, 'HTTP 2xx', 'has correct result')

    t.end()
  })

  const server = http.createServer(function (req, res) {
    agent._instrumentation.supersedeWithEmptyRunContext()
    res.end()
  })

  server.listen(function () {
    const port = server.address().port
    http.get(`http://localhost:${port}`, function (res) {
      res.resume()
      res.on('end', () => {
        server.close()
      })
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
