'use strict'

var agent = require('../../..').start({
  appName: 'test',
  captureExceptions: false,
  maxQueueSize: 0
})
var ins = agent._instrumentation

var semver = require('semver')

// The http2 module wasn't included before Node.js v8.4.0
if (semver.lt(process.version, '8.4.0')) process.exit()

var test = require('tape')
var http2 = require('http2')
var pem = require('https-pem')
var assert = require('./_http_assert')

test('http2.createSecureServer', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
    t.end()
  })

  var server = http2.createSecureServer(pem)
  server.on('error', onError)
  server.on('socketError', onError)
  server.on('stream', function (stream, headers) {
    var trans = ins.currentTransaction
    t.ok(trans, 'have current transaction')
    t.equal(trans.type, 'request')

    stream.respond({':status': 200})
    stream.end('foo')
  })

  server.listen(function () {
    var client = http2.connect('https://localhost:' + server.address().port, {
      rejectUnauthorized: false
    })
    client.on('error', onError)
    client.on('socketError', onError)

    var req = client.request({':path': '/'})
    req.resume()
    req.on('end', function () {
      client.destroy()
    })
    req.end()
  })

  function onError (err) {
    t.error(err)
  }
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb }
}
