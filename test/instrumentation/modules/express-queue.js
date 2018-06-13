'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')

// The mini-queue module beneath express-queue doesn't work before 6.x
if (semver.lt(process.version, '6.0.0')) process.exit()

var http = require('http')

var express = require('express')
var queue = require('express-queue')
var test = require('tape')

test('express-queue', function (t) {
  resetAgent(done(t, 'done'))

  var app = express()
  app.use(queue({ activeLimit: 1, queuedLimit: -1 }))
  app.get('/', function (req, res) {
    setImmediate(function () {
      var span = agent.startSpan('foo', 'bar')
      setImmediate(function () {
        if (span) span.end()
        res.end('done')
      })
    })
  })

  var server = app.listen(function () {
    var port = server.address().port
    var path = '/'

    var tasks = []
    for (let i = 0; i < 5; i++) {
      tasks.push(request(port, path))
    }

    Promise.all(tasks).then(done, done)

    function done () {
      agent.flush()
      server.close()
    }
  })
})

function request (port, path) {
  return new Promise((resolve, reject) => {
    var opts = {
      method: 'GET',
      port: port,
      path: path,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('error', reject)
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        resolve(Buffer.concat(chunks).toString())
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function done (t, query) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 5)

    data.transactions.forEach(function (trans, i) {
      t.comment('request ' + (i + 1))
      t.equal(trans.name, 'GET /', 'name should be GET /')
      t.equal(trans.type, 'request', 'type should be request')
      t.equal(trans.spans.length, 1, 'spans length should be 1')
      var span = trans.spans[0]
      t.equal(span.name, 'foo', 'span name should be foo')
      t.equal(span.type, 'bar', 'span name should be bar')
      t.ok(span.start + span.duration < trans.duration, 'span should have valid timings')
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () { } }
  agent.captureError = function (err) { throw err }
}
