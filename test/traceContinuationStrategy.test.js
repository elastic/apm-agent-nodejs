'use strict'

// Test the behaviour of the `traceContinuationStrategy` config var.

const apm = require('../').start({
  serviceName: 'test-traceContinuationStrategy',
  logLevel: 'off',
  captureExceptions: false,
  metricsInterval: '0s',
  disableSend: true
})

const http = require('http')
const semver = require('semver')
const tape = require('tape')

// Ensure that, by default, an HTTP request with a valid traceparent to an
// instrumented HTTP server *uses* that traceparent.
tape.test('traceContinuationStrategy default is continue', t => {
  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction
    t.ok(currTrans, 'have a currentTransaction')
    t.equal(currTrans.traceId, '12345678901234567890123456789012', `currentTransaction.traceId (${currTrans.traceId})`)
    t.equal(currTrans.parentId, '1234567890123456', `currentTransaction.parentId (${currTrans.parentId})`)
    res.end('pong')
  })
  server.listen(function () {
    const url = 'http://localhost:' + server.address().port
    http.get(url, {
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01'
      }
    }, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response')
      res.resume()
      res.on('end', function () {
        server.close()
        t.end()
      })
    })
  })
})

tape.test('traceContinuationStrategy=continue', t => {
  // Hack in the traceContinuationStrategy value. This is equiv to having
  // started the agent with this setting.
  apm._conf.traceContinuationStrategy = 'continue'

  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction
    t.ok(currTrans, 'have a currentTransaction')
    t.equal(currTrans.traceId, '12345678901234567890123456789012', `currentTransaction.traceId (${currTrans.traceId})`)
    t.equal(currTrans.parentId, '1234567890123456', `currentTransaction.parentId (${currTrans.parentId})`)
    res.end('pong')
  })
  server.listen(function () {
    if (semver.satisfies(process.version, '<=8') && apm._conf.asyncHooks === false) {
      // There is some bug in node v8 and lower and with asyncHooks=false
      // instrumentation where this listener callback takes the run context of
      // the preceding test's transaction. Hack it back.
      apm._instrumentation.supersedeWithEmptyRunContext()
    }

    const url = 'http://localhost:' + server.address().port
    http.get(url, {
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01'
      }
    }, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response')
      res.resume()
      res.on('end', function () {
        server.close()
        t.end()
      })
    })
  })
})

// With 'restart' the incoming traceparent should be ignored.
tape.test('traceContinuationStrategy=restart', t => {
  // Hack in the traceContinuationStrategy value. This is equiv to having
  // started the agent with this setting.
  apm._conf.traceContinuationStrategy = 'restart'

  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction
    t.ok(currTrans, 'have a currentTransaction')
    t.not(currTrans.traceId, '12345678901234567890123456789012', `currentTransaction.traceId (${currTrans.traceId})`)
    t.not(currTrans.parentId, '1234567890123456', `currentTransaction.parentId (${currTrans.parentId})`)
    res.end('pong')
  })
  server.listen(function () {
    if (semver.satisfies(process.version, '<=8') && apm._conf.asyncHooks === false) {
      // There is some bug in node v8 and lower and with asyncHooks=false
      // instrumentation where this listener callback takes the run context of
      // the preceding test's transaction. Hack it back.
      apm._instrumentation.supersedeWithEmptyRunContext()
    }

    const url = 'http://localhost:' + server.address().port
    http.get(url, {
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01'
      }
    }, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response')
      res.resume()
      res.on('end', function () {
        server.close()
        t.end()
      })
    })
  })
})

// XXX 'restart_external'
