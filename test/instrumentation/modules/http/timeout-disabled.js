'use strict'

var agent = require('../../_agent')()

var test = require('tape')
var http = require('http')

agent.timeout.active = false

test('client-side timeout - call end', function (t) {
  agent._instrumentation._queue = []
  var clientReq

  var server = http.createServer(function (req, res) {
    clientReq.abort()
    res.write('Hello')
    setTimeout(function () {
      res.end(' World')
    }, 10)
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 0, 'should not add transactions to queue')
        server.close()
        t.end()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('client-side timeout - don\'t call end', function (t) {
  agent._instrumentation._queue = []
  var clientReq

  var server = http.createServer(function (req, res) {
    clientReq.abort()
    res.write('Hello')
  })

  server.listen(function () {
    var port = server.address().port
    clientReq = http.get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback')
    })
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err
      setTimeout(function () {
        t.equal(agent._instrumentation._queue.length, 0, 'should not add transactions to queue')
        server.close()
        t.end()
      }, agent.timeout.socketClosedDelay + 100)
    })
  })
})

test('server-side timeout - call end', function (t) {
  agent._instrumentation._queue = []
  var timedout = false
  var ended = false

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      res.end('Hello World')
      ended = true
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
      setTimeout(function () {
        t.ok(ended, 'should have called res.end')
        t.equal(agent._instrumentation._queue.length, 0, 'should not add transactions to queue')
        server.close()
        t.end()
      }, 100)
    })
  })
})

test('server-side timeout - don\'t call end', function (t) {
  agent._instrumentation._queue = []
  var timedout = false

  var server = http.createServer(function (req, res) {
    setTimeout(function () {
      t.ok(timedout, 'should have closed socket')
      t.equal(agent._instrumentation._queue.length, 0, 'should not add transactions to queue')
      server.close()
      t.end()
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
    })
  })
})
