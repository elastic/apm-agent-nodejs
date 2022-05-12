'use strict'

const agent = require('../../../..').start({
  serviceName: 'test-http-outgoing',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

var http = require('http')
var https = require('https')
var url = require('url')

var endOfStream = require('end-of-stream')
var semver = require('semver')
var test = require('tape')

var echoServer = require('./_echo_server_util').echoServer
var mockClient = require('../../../_mock_http_client')
var { TraceParent } = require('../../../../lib/tracecontext/traceparent')

var methods = ['request', 'get']

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

test('http: consider useElasticTraceparentHeader config option', echoTest('http', { useElasticTraceparentHeader: false }, (port, cb) => {
  var options = { port }
  return http.request(options, cb)
}))

test('http.request(options, callback) - aborted before socket', abortTest('http', (port, cb) => {
  const req = http.request({ port }, cb)

  setImmediate(() => {
    req.abort()
  })

  return req
}))

test('http.request(options, callback) - aborted on socket', abortTest('http', (port, cb) => {
  const req = http.request({ port }, cb)

  req.on('socket', () => {
    req.abort()
  })

  return req
}))

test('http.request(options, callback) - aborted on data', abortTest('http', (port, cb) => {
  const req = http.request({ method: 'POST', port }, cb)

  req.on('response', (res) => {
    res.on('data', () => {
      req.abort()
    })
  })

  req.write('hello')

  return req
}))

methods.forEach(function (name) {
  test(`http.${name}(urlString)`, echoTest('http', (port, cb) => {
    var urlString = `http://localhost:${port}`
    var req = http[name](urlString)
    req.on('response', cb)
    return req
  }))

  test(`http.${name}(urlString, callback)`, echoTest('http', (port, cb) => {
    var urlString = `http://localhost:${port}`
    return http[name](urlString, cb)
  }))

  if (url.URL) {
    test(`http.${name}(urlObject)`, echoTest('http', (port, cb) => {
      var urlString = `http://localhost:${port}`
      var urlObject = new url.URL(urlString)
      var req = http[name](urlObject)
      req.on('response', cb)
      return req
    }))

    test(`http.${name}(urlObject, callback)`, echoTest('http', (port, cb) => {
      var urlString = `http://localhost:${port}`
      var urlObject = new url.URL(urlString)
      return http[name](urlObject, cb)
    }))
  }
})

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

test('https: consider useElasticTraceparentHeader config option', echoTest('https', { useElasticTraceparentHeader: false }, (port, cb) => {
  var options = { port, rejectUnauthorized: false }
  return https.request(options, cb)
}))

methods.forEach(function (name) {
  test(`https.${name}(urlString, options)`, echoTest('https', (port, cb) => {
    var urlString = `https://localhost:${port}`
    var options = { rejectUnauthorized: false }
    var req = https[name](urlString, options)
    req.on('response', cb)
    return req
  }))

  if (semver.satisfies(process.version, '>=10.9')) {
    test(`https.${name}(urlString, options, callback)`, echoTest('https', (port, cb) => {
      var urlString = `https://localhost:${port}`
      var options = { rejectUnauthorized: false }
      return https[name](urlString, options, cb)
    }))
  }

  if (url.URL && semver.satisfies(process.version, '>=10.9')) {
    test(`https.${name}(urlObject, options)`, echoTest('https', (port, cb) => {
      var urlString = `https://localhost:${port}`
      var urlObject = new url.URL(urlString)
      var options = { rejectUnauthorized: false }
      var req = https[name](urlObject, options)
      req.on('response', cb)
      return req
    }))

    test(`https.${name}(urlObject, options, callback)`, echoTest('https', (port, cb) => {
      var urlString = `https://localhost:${port}`
      var urlObject = new url.URL(urlString)
      var options = { rejectUnauthorized: false }
      return https[name](urlObject, options, cb)
    }))
  }
})

function echoTest (type, opts, handler) {
  if (arguments.length === 2) {
    handler = opts
    opts = undefined
  }

  return function (t) {
    echoServer(type, (cp, port) => {
      resetAgent(opts, data => {
        t.strictEqual(data.transactions.length, 1, 'has one transaction')
        t.strictEqual(data.spans.length, 1, 'has one span')
        t.strictEqual(data.spans[0].name, 'GET localhost:' + port, 'has expected span name')
        t.strictEqual(data.spans[0].outcome, 'success')
        t.deepEqual(data.spans[0].context.http, {
          method: 'GET',
          status_code: 200,
          url: `${type}://localhost:${port}/`
        })
        t.deepEqual(data.spans[0].context.destination, {
          service: {
            name: `${type}://localhost:${port}`,
            resource: `localhost:${port}`,
            type: data.spans[0].type
          },
          address: 'localhost',
          port: Number(port)
        })
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

      var traceparent = req.getHeader('traceparent')
      t.ok(traceparent, 'should have traceparent header')
      if (opts && opts.useElasticTraceparentHeader === false) {
        t.strictEqual(req.getHeader('elastic-apm-traceparent'), undefined)
      } else {
        t.ok(req.getHeader('elastic-apm-traceparent'), 'should have elastic-apm-traceparent header')
      }

      var expected = TraceParent.fromString(trans._context.toString())
      var received = TraceParent.fromString(traceparent)
      t.strictEqual(received.version, expected.version, 'traceparent header has matching version')
      t.strictEqual(received.traceId, expected.traceId, 'traceparent header has matching traceId')
      t.ok(/^[\da-f]{16}$/.test(expected.id), 'traceparent header has valid id')
      t.strictEqual(received.flags, expected.flags, 'traceparent header has matching flags')

      // Detect if the test called `http.get` (in which case outputSize should
      // be greater than zero) or `http.request` (in which case it should equal
      // zero)
      if (req.outputSize === 0) req.end()
    })
  }
}

function abortTest (type, handler) {
  return function (t) {
    echoServer(type, (cp, port) => {
      const httpContext = {
        method: 'GET',
        status_code: undefined,
        url: `http://localhost:${port}/`
      }

      resetAgent({}, data => {
        t.equal(data.transactions.length, 1, 'has one transaction')
        t.equal(data.spans.length, 1, 'has one span')
        t.equal(data.spans[0].name, `${req.method} localhost:${port}`, 'has expected span name')
        if (typeof httpContext.status_code === 'undefined') {
          t.equal(data.spans[0].outcome, 'unknown')
        } else {
          t.equal(data.spans[0].outcome, 'success')
        }

        t.deepEqual(data.spans[0].context.http, httpContext)
        if (httpContext.url) {
          t.deepEqual(data.spans[0].context.destination, {
            service: {
              name: `${type}://localhost:${port}`,
              resource: `localhost:${port}`,
              type: data.spans[0].type
            },
            address: 'localhost',
            port: Number(port)
          })
        }
        t.end()
        cp.kill()
      })

      agent.startTransaction()
      const req = handler(port, res => {
        res.resume()
      })

      httpContext.method = req.method

      req.on('response', () => {
        httpContext.status_code = 200
        httpContext.url = `${type}://localhost:${port}/`
      })

      // NOTE: Don't use an arrow function here
      endOfStream(req, function () {
        agent.endTransaction()
      })

      if (req.outputSize === 0) req.end()
    })
  }
}

function resetAgent (opts, cb) {
  agent._instrumentation.testReset()
  agent._config(opts)
  agent._transport = mockClient(2, cb)
}
