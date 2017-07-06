'use strict'

var agent = require('../../_agent')()

var test = require('tape')
var http = require('http')

test('normal response', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    assertNonSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    var trace = agent.buildTrace()
    if (trace) trace.start('foo', 'bar')
    setTimeout(function () {
      if (trace) trace.end()
      res.end()
    }, 10)
  })

  request(server)
})

test('SSE response with explicit headers', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    assertSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/event-stream'})
    var trace = agent.buildTrace()
    if (trace) trace.start('foo', 'bar')
    setTimeout(function () {
      if (trace) trace.end()
      res.end()
    }, 10)
  })

  request(server)
})

test('SSE response with implicit headers', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    assertSSEResponse(t, data)
    t.end()
  })

  var server = http.createServer(function (req, res) {
    res.setHeader('Content-type', 'text/event-stream; foo')
    res.write('data: hello world\n\n')
    var trace = agent.buildTrace()
    if (trace) trace.start('foo', 'bar')
    setTimeout(function () {
      if (trace) trace.end()
      res.end()
    }, 10)
  })

  request(server)
})

function assertNonSSEResponse (t, data) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.traces.length, 1)
  t.equal(trans.traces[0].name, 'foo')
  t.equal(trans.traces[0].type, 'bar')
  t.equal(trans.context.request.method, 'GET')
}

function assertSSEResponse (t, data) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.traces.length, 0)
  t.equal(trans.context.request.method, 'GET')
}

function request (server) {
  server.listen(function () {
    var port = server.address().port
    http.request({ port: port }, function (res) {
      res.on('end', function () {
        agent._instrumentation._queue._flush()
        server.close()
      })
      res.resume()
    }).end()
  })
}

function resetAgent (cb) {
  agent._httpClient = { request: cb }
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
