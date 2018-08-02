'use strict'

var agent = require('../../_agent')()

var test = require('tape')

var echoServer = require('./_echo_server_util').echoServer
var mockClient = require('../../../_mock_http_client')

var transports = [['http', require('http')], ['https', require('https')]]

transports.forEach(function (tuple) {
  var name = tuple[0]
  var transport = tuple[1]

  test(name + '.request', function (t) {
    echoServer(name, function (cp, port) {
      resetAgent(function (data) {
        t.equal(data.transactions.length, 1)
        t.equal(data.spans.length, 1)
        t.equal(data.spans[0].name, 'GET localhost:' + port + '/')
        t.end()
        cp.kill()
      })

      agent.startTransaction()
      var req = transport.request({port: port, rejectUnauthorized: false}, function (res) {
        res.on('end', function () {
          agent.endTransaction()
        })
        res.resume()
      })
      req.end()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(2, cb)
}
