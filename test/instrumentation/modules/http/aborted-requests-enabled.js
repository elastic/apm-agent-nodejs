'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')

var assert = require('../_http_assert')

var addEndedTransaction = agent._instrumentation.addEndedTransaction
agent._conf.errorOnAbortedRequests = true

test('client-side abort below error threshold - call end', function (t) {
  var clientReq
  t.plan(8)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
    agent.flush()
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
    }, agent._conf.abortedErrorThreshold / 2)
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

test('client-side abort above error threshold - call end', function (t) {
  var clientReq
  t.plan(10)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
    agent.flush()
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
    }, agent._conf.abortedErrorThreshold + 10)
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

test('client-side abort below error threshold - don\'t call end', function (t) {
  var clientReq
  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data')
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
        setTimeout(function () {
          server.close()
          t.end()
        }, 10)
      }, 10)
    }, agent._conf.abortedErrorThreshold / 2)
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

test('client-side abort above error threshold - don\'t call end', function (t) {
  var clientReq
  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data')
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold)
    server.close()
    t.end()
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      clientReq.abort()
      setTimeout(function () {
        res.write('Hello') // server emits clientError if written in same tick as abort
      }, 10)
    }, agent._conf.abortedErrorThreshold + 10)
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

test('server-side abort below error threshold and socket closed - call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(11)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
    agent.flush()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
      res.end('Hello World')
      t.ok(ended, 'should have ended transaction')
      server.close()
    }, agent._conf.abortedErrorThreshold / 2 + 100)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold / 2)

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

test('server-side abort above error threshold and socket closed - call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(13)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
    agent.flush()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
      res.end('Hello World')
      t.ok(ended, 'should have ended transaction')
      server.close()
    }, agent._conf.abortedErrorThreshold + 100)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold + 10)

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

test('server-side abort below error threshold and socket closed - don\'t call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(3)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data')
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
      server.close()
    }, agent._conf.abortedErrorThreshold / 2 + 100)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold / 2)

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

test('server-side abort above error threshold and socket closed - don\'t call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(5)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data')
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should have ended transaction')
      server.close()
    }, agent._conf.abortedErrorThreshold + 150)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold + 50)

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

test('server-side abort below error threshold but socket not closed - call end', function (t) {
  t.plan(8)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = addEndedTransaction

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {})

    setTimeout(function () {
      res.end('Hello World')
    }, agent._conf.abortedErrorThreshold / 2 + 100)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold / 2)

  server.listen(function () {
    var port = server.address().port
    http.get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
        agent.flush()
      })
      res.resume()
    })
  })
})

test('server-side abort above error threshold but socket not closed - call end', function (t) {
  t.plan(8)

  resetAgent()

  t.equal(agent._instrumentation._queue._items.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the closed socket as an error')
  }
  agent._instrumentation.addEndedTransaction = addEndedTransaction

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {})

    setTimeout(function () {
      res.end('Hello World')
    }, agent._conf.abortedErrorThreshold + 100)
  })

  server.setTimeout(agent._conf.abortedErrorThreshold + 10)

  server.listen(function () {
    var port = server.address().port
    http.get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.equal(agent._instrumentation._queue._items.length, 1, 'should add transactions to queue')
        agent.flush()
      })
      res.resume()
    })
  })
})

function resetAgent () {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
