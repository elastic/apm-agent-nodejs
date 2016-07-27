'use strict'

var agent = require('../../_agent')()

var assert = require('./_assert')
var test = require('tape')
var http = require('http')

agent.timeout.active = true

test('client-side timeout below error threshold - call end', function (t) {
  t.plan(17)

  resetAgent(function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  })

  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  var clientReq

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      res.write('Hello')
      setTimeout(function () {
        res.end(' World')
      }, 10)
    }, agent.timeout.errorThreshold / 2)
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('client-side timeout above error threshold - call end', function (t) {
  t.plan(21)

  resetAgent(function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.endCalled, true)
    t.equal(opts.extra.serverTimeout, false)
    t.ok(opts.extra.abortTime > 0)
  }
  var clientReq

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      // clientReq.abort()
      // clientReq.socket.destroy()
      req.socket.destroy()
      res.write('Hello')
      setTimeout(function () {
        res.end(' World')
      }, 10)
    }, agent.timeout.errorThreshold + 10)
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('client-side timeout below error threshold - don\'t call end', function (t) {
  t.plan(17)

  resetAgent(function (endpoint, data, cb) {
    assert(t, data, { result: 42 })
    server.close()
  })

  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  var clientReq

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
      }, 10)
    }, agent.timeout.errorThreshold / 2)
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('client-side timeout above error threshold - don\'t call end', function (t) {
  t.plan(21)

  resetAgent(function (endpoint, data, cb) {
    assert(t, data, { result: 42 })
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.endCalled, false)
    t.equal(opts.extra.serverTimeout, false)
    t.ok(opts.extra.abortTime > 0)
  }
  var clientReq

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
      }, 10)
    }, agent.timeout.errorThreshold + 10)
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('server-side timeout and socket closed - call end', function (t) {
  t.plan(20)

  var timedout = false

  resetAgent(function (endpoint, data, cb) {
    assert(t, data, { result: 42 })
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.serverTimeout, true)
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      res.end('Hello World')
    }, agent.timeout.socketClosedDelay + 100)
  })

  server.setTimeout(agent.timeout.socketClosedDelay)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
      t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
      agent._instrumentation._send()
    })
  })
})

test('server-side timeout and socket closed - don\'t call end', function (t) {
  t.plan(20)

  var timedout = false

  resetAgent(function (endpoint, data, cb) {
    assert(t, data, { result: 42 })
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.serverTimeout, true)
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
    }, agent.timeout.socketClosedDelay + 100)
  })

  server.setTimeout(agent.timeout.socketClosedDelay)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
      t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
      agent._instrumentation._send()
    })
  })
})

test('server-side timeout but socket not closed - call end', function (t) {
  t.plan(19)

  resetAgent(function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.serverTimeout, true)
  }

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {})

    setTimeout(function () {
      res.end('Hello World')
    }, agent.timeout.socketClosedDelay + 100)
  })

  server.setTimeout(agent.timeout.socketClosedDelay)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      res.resume()
      clientReq.on('close', function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      })
    })
  })
})

test('server-side timeout but socket not closed - don\'t call end', function (t) {
  t.plan(23)

  var timeouts = 0
  var clientReq

  resetAgent(function (endpoint, data, cb) {
    t.equal(timeouts, 2)
    assert(t, data)
    clientReq.abort()
    server.close()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'Transaction timeout')
    t.equal(opts.extra.serverTimeout, true)
  }

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {
      timeouts++
    })

    res.write('Hello')
    setTimeout(function () {
      t.equal(timeouts, 1)
      res.write(' World')
    }, agent.timeout.socketClosedDelay + 100)
  })

  server.setTimeout(agent.timeout.socketClosedDelay)

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      res.once('data', function (chunk) {
        t.equal(chunk.toString(), 'Hello')
        res.once('data', function (chunk) {
          t.equal(chunk.toString(), ' World')
          setTimeout(function () {
            t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
            agent._instrumentation._send()
          }, agent.timeout.socketClosedDelay + 100)
        })
      })
    })
  })
})

test('server-side timeout but socket not closed and then client-side timeout - call end')
test('server-side timeout but socket not closed and then client-side timeout - don\'t call end')

function resetAgent (cb) {
  agent._instrumentation._queue = []
  agent._httpClient = { request: cb }
}
