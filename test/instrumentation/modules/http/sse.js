'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')

var mockClient = require('../../../_mock_http_client')

test('normal response', function (t) {
  resetAgent(2, function (data) {
    assertNonSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    var span = agent.buildSpan()
    if (span) span.start('foo', 'bar')
    setTimeout(function () {
      if (span) span.end()
      res.end()
    }, 10)
  })

  request(server)
})

test('SSE response with explicit headers', function (t) {
  resetAgent(1, function (data) {
    assertSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/event-stream'})
    var span = agent.buildSpan()
    if (span) span.start('foo', 'bar')
    setTimeout(function () {
      if (span) span.end()
      res.end()
    }, 10)
  })

  request(server)
})

test('SSE response with implicit headers', function (t) {
  resetAgent(1, function (data) {
    assertSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    res.setHeader('Content-type', 'text/event-stream; foo')
    res.write('data: hello world\n\n')
    var span = agent.buildSpan()
    if (span) span.start('foo', 'bar')
    setTimeout(function () {
      if (span) span.end()
      res.end()
    }, 10)
  })

  request(server)
})

function assertNonSSEResponse (t, data) {
  t.equal(data.transactions.length, 1)
  t.equal(data.spans.length, 1)

  var trans = data.transactions[0]
  var span = data.spans[0]

  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.context.request.method, 'GET')
  t.equal(span.name, 'foo')
  t.equal(span.type, 'bar')
}

function assertSSEResponse (t, data) {
  t.equal(data.transactions.length, 1)
  t.equal(data.spans.length, 0)

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.context.request.method, 'GET')
}

function request (server) {
  server.listen(function () {
    var port = server.address().port
    http.request({ port: port }, function (res) {
      res.on('end', function () {
        server.close()
      })
      res.resume()
    }).end()
  })
}

function resetAgent (expected, cb) {
  agent._apmServer = mockClient(expected, cb)
  agent._instrumentation.currentTransaction = null
}
