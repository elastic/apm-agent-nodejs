'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')

var assert = require('./_assert')
var mockClient = require('../../../_mock_http_client')

test('http.createServer', function (t) {
  t.test('direct callback', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = http.createServer(onRequest)
    sendRequest(server)
  })

  t.test('server.addListener()', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = http.createServer()
    server.addListener('request', onRequest)
    sendRequest(server)
  })

  t.test('server.on()', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = http.createServer()
    server.on('request', onRequest)
    sendRequest(server)
  })
})

test('new http.Server', function (t) {
  t.test('direct callback', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = new http.Server(onRequest)
    sendRequest(server)
  })

  t.test('server.addListener()', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = new http.Server()
    server.addListener('request', onRequest)
    sendRequest(server)
  })

  t.test('server.on()', function (t) {
    resetAgent(function (data) {
      assert(t, data)
      server.close()
      t.end()
    })

    var server = new http.Server()
    server.on('request', onRequest)
    sendRequest(server)
  })
})

function sendRequest (server, timeout) {
  server.listen(function () {
    var port = server.address().port
    var req = http.get('http://localhost:' + port, function (res) {
      if (timeout) throw new Error('should not get to here')
      res.resume()
    })

    if (timeout) {
      process.nextTick(function () {
        req.abort()
      })
    }
  })
}

function onRequest (req, res) {
  res.end()
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(1, cb)
}
