'use strict'

var agent = require('../../_agent')()

var http = require('http')
var https = require('https')
var url = require('url')

var semver = require('semver')
var test = require('tape')

var echoServer = require('./_echo_server_util').echoServer
var mockClient = require('../../../_mock_http_client')
var TraceContext = require('.././../../../lib/instrumentation/trace-context')

//
// http
//
test('http.request(options)', echoTest('http', (port, cb) => {
  var options = { port }
  var req = http.request(options)
  req.on('response', cb)
  return req
}))

test('http.request(options, callback)', echoTest('http', (port, cb) => {
  var options = { port }
  return http.request(options, cb)
}))

test('http.request(urlString)', echoTest('http', (port, cb) => {
  var urlString = `http://localhost:${port}`
  var req = http.request(urlString)
  req.on('response', cb)
  return req
}))

test('http.request(urlString, callback)', echoTest('http', (port, cb) => {
  var urlString = `http://localhost:${port}`
  return http.request(urlString, cb)
}))

if (url.URL) {
  test('http.request(urlObject)', echoTest('http', (port, cb) => {
    var urlString = `http://localhost:${port}`
    var urlObject = new url.URL(urlString)
    var req = http.request(urlObject)
    req.on('response', cb)
    return req
  }))

  test('http.request(urlObject, callback)', echoTest('http', (port, cb) => {
    var urlString = `http://localhost:${port}`
    var urlObject = new url.URL(urlString)
    return http.request(urlObject, cb)
  }))
}

//
// https
//
test('https.request(options)', echoTest('https', (port, cb) => {
  var options = { port, rejectUnauthorized: false }
  var req = https.request(options)
  req.on('response', cb)
  return req
}))

test('https.request(options, callback)', echoTest('https', (port, cb) => {
  var options = { port, rejectUnauthorized: false }
  return https.request(options, cb)
}))

test('https.request(urlString, options)', echoTest('https', (port, cb) => {
  var urlString = `https://localhost:${port}`
  var options = { rejectUnauthorized: false }
  var req = https.request(urlString, options)
  req.on('response', cb)
  return req
}))

if (semver.satisfies(process.version, '>=10.9')) {
  test('https.request(urlString, options, callback)', echoTest('https', (port, cb) => {
    var urlString = `https://localhost:${port}`
    var options = { rejectUnauthorized: false }
    var req = https.request(urlString, options, cb)
    return req
  }))
}

if (url.URL && semver.satisfies(process.version, '>=10.9')) {
  test('https.request(urlObject, options)', echoTest('https', (port, cb) => {
    var urlString = `https://localhost:${port}`
    var urlObject = new url.URL(urlString)
    var options = { rejectUnauthorized: false }
    var req = https.request(urlObject, options)
    req.on('response', cb)
    return req
  }))

  test('https.request(urlObject, options, callback)', echoTest('https', (port, cb) => {
    var urlString = `https://localhost:${port}`
    var urlObject = new url.URL(urlString)
    var options = { rejectUnauthorized: false }
    var req = https.request(urlObject, options, cb)
    return req
  }))
}

function echoTest (type, handler) {
  return function (t) {
    echoServer(type, (cp, port) => {
      resetAgent(data => {
        t.equal(data.transactions.length, 1, 'has one transaction')
        t.equal(data.spans.length, 1, 'has one span')
        t.equal(data.spans[0].name, 'GET localhost:' + port + '/', 'has expected span name')
        t.end()
        cp.kill()
      })

      var trans = agent.startTransaction()
      var req = handler(port, res => {
        res.on('end', function () {
          agent.endTransaction()
        })
        res.resume()
      })

      var expected = TraceContext.fromString(trans.context.toString())
      var received = TraceContext.fromString(req.getHeader('elastic-apm-traceparent'))
      t.equal(received.version, expected.version, 'traceparent header has matching version')
      t.equal(received.traceId, expected.traceId, 'traceparent header has matching traceId')
      t.ok(/^[\da-f]{16}$/.test(expected.id), 'traceparent header has valid id')
      t.equal(received.flags, expected.flags, 'traceparent header has matching flags')

      req.end()
    })
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(2, cb)
}
