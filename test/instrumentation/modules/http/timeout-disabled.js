'use strict'

var agent = require('../../_agent')()

var test = require('tape')
var http = require('http')

agent.timeout.active = false

test('client-side timeout - call end', function (t) {
  resetAgent()
  var clientReq

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  var server = http.createServer(function (req, res) {
    res.on('close', function () {
      setTimeout(function () {
        t.equal(agent._instrumentation._queue._samples.length, 1, 'should add transactions to queue')
        server.close()
        t.end()
      }, 50)
    })

    clientReq.abort()
    setTimeout(function () {
      res.write('Hello') // server emits clientError if written in same tick as abort
      setTimeout(function () {
        res.end(' World')
      }, 10)
    }, 10)
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

test('client-side timeout - don\'t call end', function (t) {
  resetAgent()
  var clientReq

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  var server = http.createServer(function (req, res) {
    res.on('close', function () {
      setTimeout(function () {
        t.equal(agent._instrumentation._queue._samples.length, 0, 'should not add transactions to queue')
        server.close()
        t.end()
      }, 50)
    })

    clientReq.abort()
    setTimeout(function () {
      res.write('Hello') // server emits clientError if written in same tick as abort
    }, 10)
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

test('server-side timeout - call end', function (t) {
  resetAgent()
  var timedout = false
  var closeEvent = false

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  var server = http.createServer(function (req, res) {
    res.on('close', function () {
      closeEvent = true
    })

    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(closeEvent, 'res should emit close event')
      res.end('Hello World')

      setTimeout(function () {
        t.equal(agent._instrumentation._queue._samples.length, 1, 'should not add transactions to queue')
        server.close()
        t.end()
      }, 50)
    }, 200)
  })

  server.setTimeout(100)

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

test('server-side timeout - don\'t call end', function (t) {
  resetAgent()
  var timedout = false
  var closeEvent = false

  t.equal(agent._instrumentation._queue._samples.length, 0, 'should not have any samples to begin with')

  var server = http.createServer(function (req, res) {
    res.on('close', function () {
      closeEvent = true
    })

    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.ok(closeEvent, 'res should emit close event')
      t.equal(agent._instrumentation._queue._samples.length, 0, 'should not add transactions to queue')
      server.close()
      t.end()
    }, 200)
  })

  server.setTimeout(100)

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

function resetAgent () {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
