'use strict'

var agent = require('../../_agent')()

var assert = require('./_assert')
var test = require('tape')
var http = require('http')

var addEndedTransaction = agent._instrumentation.addEndedTransaction
agent.timeout.active = true

test('client-side timeout below error threshold - call end', function (t) {
  var clientReq
  t.plan(19)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
    agent._instrumentation._queue._flush()
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
  t.plan(21)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
    agent._instrumentation._queue._flush()
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
  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data to opbeat')
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
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
  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data to opbeat')
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
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
  t.plan(22)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
    agent._instrumentation._queue._flush()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
      res.end('Hello World')
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

test('server-side timeout above error threshold and socket closed - call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(24)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    assert(t, data)
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments)
    ended = true
    t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
    agent._instrumentation._queue._flush()
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
      res.end('Hello World')
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

test('server-side timeout below error threshold and socket closed - don\'t call end', function (t) {
  var timedout = false
  var ended = false
  t.plan(3)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data to opbeat')
  }}
  agent.captureError = function (err, opts) { // eslint-disable-line handle-callback-err
    t.fail('should not register the timeout as an error')
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should not have ended transaction')
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
  t.plan(5)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
    t.fail('should not send any data to opbeat')
  }}
  agent.captureError = function (err, opts) {
    t.equal(err, 'Socket closed with active HTTP request (>0.25 sec)')
    t.ok(opts.extra.abortTime > agent.timeout.errorThreshold)
  }
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction')
  }

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.notOk(ended, 'should have ended transaction')
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
  t.plan(19)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
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
        t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
        agent._instrumentation._queue._flush()
      })
      res.resume()
    })
  })
})

test('server-side timeout above error threshold but socket not closed - call end', function (t) {
  t.plan(19)

  resetAgent()

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  agent._httpClient = {request: function (endpoint, headers, data, cb) {
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
        t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
        agent._instrumentation._queue._flush()
      })
      res.resume()
    })
  })
})

function resetAgent () {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
