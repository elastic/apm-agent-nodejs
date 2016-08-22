'use strict'

var agent = require('../../_agent')()

var test = require('tape')
var http = require('http')

test('normal response', function (t) {
  resetAgent(function (endpoint, data, cb) {
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
  resetAgent(function (endpoint, data, cb) {
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
  resetAgent(function (endpoint, data, cb) {
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
  // data.traces.groups:
  t.equal(data.traces.groups.length, 2)

  t.equal(data.traces.groups[0].transaction, 'GET unknown route')
  t.equal(data.traces.groups[0].signature, 'foo')
  t.equal(data.traces.groups[0].kind, 'bar')
  t.deepEqual(data.traces.groups[0].parents, ['transaction'])

  t.equal(data.traces.groups[1].transaction, 'GET unknown route')
  t.equal(data.traces.groups[1].signature, 'transaction')
  t.equal(data.traces.groups[1].kind, 'transaction')
  t.deepEqual(data.traces.groups[1].parents, [])

  // data.transactions:
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'GET unknown route')
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)

  // data.traces.raw:
  //
  // [
  //   [
  //     15.240414,                  // total transaction time
  //     [ 0, 0.428756, 11.062134 ], // foo trace
  //     [ 1, 0, 15.240414 ]         // root trace
  //   ]
  // ]
  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, 3)
  t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
  t.equal(data.traces.raw[0][1].length, 3)
  t.equal(data.traces.raw[0][2].length, 3)

  t.equal(data.traces.raw[0][1][0], 0)
  t.ok(data.traces.raw[0][1][1] > 0)
  t.ok(data.traces.raw[0][1][2] > 0)
  t.ok(data.traces.raw[0][1][1] < data.traces.raw[0][0])
  t.ok(data.traces.raw[0][1][2] < data.traces.raw[0][0])

  t.equal(data.traces.raw[0][2][0], 1)
  t.equal(data.traces.raw[0][2][1], 0)
  t.equal(data.traces.raw[0][2][2], data.traces.raw[0][0])
}

function assertSSEResponse (t, data) {
  // data.traces.groups:
  t.equal(data.traces.groups.length, 1)

  t.equal(data.traces.groups[0].transaction, 'GET unknown route')
  t.equal(data.traces.groups[0].signature, 'transaction')
  t.equal(data.traces.groups[0].kind, 'transaction')
  t.deepEqual(data.traces.groups[0].parents, [])

  // data.transactions:
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'GET unknown route')
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)

  // data.traces.raw:
  //
  // [
  //   [
  //     15.240414,          // total transaction time
  //     [ 0, 0, 15.240414 ] // root trace
  //   ]
  // ]
  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, 2)
  t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
  t.equal(data.traces.raw[0][1].length, 3)

  t.equal(data.traces.raw[0][1][0], 0)
  t.equal(data.traces.raw[0][1][1], 0)
  t.equal(data.traces.raw[0][1][2], data.traces.raw[0][0])
}

function request (server) {
  server.listen(function () {
    var port = server.address().port
    http.request({ port: port }, function (res) {
      res.on('end', function () {
        agent._instrumentation._send()
        server.close()
      })
      res.resume()
    }).end()
  })
}

function resetAgent (cb) {
  agent._httpClient = { request: cb }

  var ins = agent._instrumentation
  if (ins._timeout) {
    clearTimeout(ins._timeout)
    ins._timeout = null
  }
  ins._queue = []
}
