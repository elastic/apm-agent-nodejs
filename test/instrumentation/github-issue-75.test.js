/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0
})

var http = require('http')

var send = require('send')
var test = require('tape')

var mockClient = require('../_mock_http_client')

// run it 5 times in case of false positives due to race conditions
times(5, function (n, done) {
  test('https://github.com/elastic/apm-agent-nodejs/issues/75 ' + n, function (t) {
    resetAgent(4, function (data) {
      t.strictEqual(data.transactions.length, 2, 'should create transactions')
      t.strictEqual(data.spans.length, 2, 'should create spans')
      data.spans.forEach(function (span) {
        let trans
        data.transactions = data.transactions.filter(function (_trans) {
          const match = span.name === _trans.id
          if (match) trans = _trans
          return !match
        })
        t.ok(trans, 'span should belong to transaction')
      })
      server.close()
      t.end()
      done()
    })

    var server = http.createServer(function (req, res) {
      var span = agent.startSpan(agent.currentTransaction.id)
      setTimeout(function () {
        span.end()
        send(req, __filename).pipe(res)
      }, 50)
    })

    var requestNo = 0

    server.listen(function () {
      request()
      request()
    })

    function request () {
      var port = server.address().port
      http.get('http://localhost:' + port, function (res) {
        res.on('end', function () {
          if (++requestNo === 2) {
            agent.flush()
          }
        })
        res.resume()
      })
    }
  })
})

function times (max, fn) {
  var n = 0
  run()
  function run () {
    if (++n > max) return
    fn(n, run)
  }
}

function resetAgent (expected, cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
