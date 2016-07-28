'use strict'

var agent = require('../../_agent')()

var assert = require('./_assert')
var test = require('tape')
var http = require('http')

var addEndedTransaction = agent._instrumentation.addEndedTransaction
agent.timeout.active = true

test('client-side timeout below error threshold - call end', function (t) {
  var clientReq
  t.plan(17)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
        setTimeout(function () {
          res.end(' World')
        }, 10)
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
    })
  })
})

test('client-side timeout above error threshold - call end', function (t) {
  var clientReq
  t.plan(19)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data, { result: agent.timeout.errorResult })
    server.close()
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
        setTimeout(function () {
          res.end(' World')
        }, 10)
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
    })
  })
})

test('client-side timeout below error threshold - don\'t call end', function (t) {
  var clientReq
  t.plan(17)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

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
    })
  })
})

test('client-side timeout above error threshold - don\'t call end', function (t) {
  var clientReq
  t.plan(19)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data, { result: agent.timeout.errorResult })
    server.close()
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

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
    })
  })
})

test('server-side timeout below error threshold and socket closed - call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(19)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(ended, 'should have ended transaction')
      res.end('Hello World')
      server.close()
    }, agent.timeout.errorThreshold / 2 + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold / 2)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
    })
  })
})

test('server-side timeout above error threshold and socket closed - call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(21)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data, { result: agent.timeout.errorResult })
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(ended, 'should have ended transaction')
      res.end('Hello World')
      server.close()
    }, agent.timeout.errorThreshold + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold + 10)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
    })
  })
})

test('server-side timeout below error threshold and socket closed - don\'t call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(19)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(ended, 'should have ended transaction')
      server.close()
    }, agent.timeout.errorThreshold / 2 + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold / 2)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
    })
  })
})

test('server-side timeout above error threshold and socket closed - don\'t call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(21)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data, { result: agent.timeout.errorResult })
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
    agent._instrumentation._send()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(ended, 'should have ended transaction')
      server.close()
    }, agent.timeout.errorThreshold + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold + 10)

  server.listen(function () {
    var port = server.address().port
    var clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      timedout = true
    })
  })
})

test('server-side timeout below error threshold but socket not closed - call end', function (t) {
  t.plan(17)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = addEndedTransaction

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {})

    setTimeout(function () {
      res.end('Hello World')
    }, agent.timeout.errorThreshold / 2 + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold / 2)

  server.listen(function () {
    var port = server.address().port
    http.get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      })
      res.resume()
    })
  })
})

test('server-side timeout above error threshold but socket not closed - call end', function (t) {
  t.plan(17)

  agent._instrumentation._queue = []
  agent._httpClient = {request: function (endpoint, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = addEndedTransaction

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {})

    setTimeout(function () {
      res.end('Hello World')
    }, agent.timeout.errorThreshold + 100)
  })

  server.setTimeout(agent.timeout.errorThreshold + 10)

  server.listen(function () {
    var port = server.address().port
    http.get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.equal(agent._instrumentation._queue.length, 1, 'should add transactions to queue')
        agent._instrumentation._send()
      })
      res.resume()
    })
  })
})
