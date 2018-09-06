'use strict'

var agent = require('../../_agent')()

var test = require('tape')

var echoServer = require('./_echo_server_util').echoServer
var mockClient = require('../../../_mock_http_client')
var TraceContext = require('.././../../../lib/instrumentation/trace-context')

var transports = [['http', require('http')], ['https', require('https')]]

transports.forEach(function (tuple) {
  var name = tuple[0]
  var transport = tuple[1]

  test(name + '.request', function (t) {
    echoServer(name, function (cp, port) {
      resetAgent(function (data, ...args) {
        t.equal(data.transactions.length, 1, 'has one transaction')
        t.equal(data.spans.length, 1, 'has one span')
        t.equal(data.spans[0].name, 'GET localhost:' + port + '/', 'has expected span name')
        t.end()
        cp.kill()
      })

      var trans = agent.startTransaction()
      var req = transport.request({ port: port, rejectUnauthorized: false }, function (res) {
        res.on('end', function () {
          agent.endTransaction()
        })
        res.resume()
      })
      const expected = TraceContext.fromString(trans.context.toString())
      const received = TraceContext.fromString(req.getHeader('Elastic-APM-traceparent'))
      t.equal(received.version, expected.version, 'traceparent header has matching version')
      t.equal(received.traceId, expected.traceId, 'traceparent header has matching traceId')
      t.ok(/^[\da-f]{16}$/.test(expected.id), 'traceparent header has valid id')
      t.equal(received.flags, expected.flags, 'traceparent header has matching flags')
      req.end()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(2, cb)
}
