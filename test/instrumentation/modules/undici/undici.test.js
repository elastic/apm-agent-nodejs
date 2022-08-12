/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

process.env.ELASTIC_APM_TEST = true
const { CapturingTransport } = require('../../../_capturing_transport')
const apm = require('../../../..').start({
  serviceName: 'test-undici',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
  transport () { return new CapturingTransport() }
})

// Skip (exit the process) if this undici instrumentation isn't supported.
try {
  require('diagnostics_channel')
} catch (_noModErr) {
  console.log('# SKIP undici instrumention is not supported (no "diagnostics_channel" module)')
  process.exit()
}
const semver = require('semver')
if (semver.lt(process.version, '12.18.0')) {
  console.log('# SKIP undici instrumention does not support node %s', process.version)
  process.exit()
}

const http = require('http')
const { Writable } = require('stream')
const { promisify } = require('util')
const test = require('tape')
const undici = require('undici')

const promisyApmFlush = promisify(apm.flush.bind(apm))
let server
let origin
let lastServerReq

// ---- support functions

// Undici docs (https://github.com/nodejs/undici#garbage-collection) suggest
// that an undici response body should always be consumed.
async function consumeResponseBody (body) {
  return new Promise(resolve => {
    const devNull = new Writable({
      write (_chunk, _encoding, cb) {
        setImmediate(cb)
      }
    })
    body.pipe(devNull)
    body.on('end', resolve)
  })
}

function assertUndiciSpan (t, span, url, reqFailed) {
  const u = new URL(url)
  t.equal(span.name, `GET ${u.host}`, 'span.name')
  t.equal(span.type, 'external', 'span.type')
  t.equal(span.subtype, 'http', 'span.subtype')
  t.equal(span.action, 'GET', 'span.action')
  t.equal(span.outcome, reqFailed ? 'failure' : 'success', 'span.outcome')
  t.equal(span.context.http.method, 'GET', 'span.context.http.method')
  t.equal(span.context.http.url, url, 'span.context.http.url')
  if (!reqFailed) {
    t.equal(span.context.http.status_code, 200, 'span.context.http.status_code')
    t.equal(span.context.http.response.encoded_body_size, 4, 'span.context.http.response.encoded_body_size')
  }
  t.equal(span.context.destination.service.name, '', 'span.context.destination.service.name')
  t.equal(span.context.destination.service.type, '', 'span.context.destination.service.type')
  t.equal(span.context.destination.service.resource, u.host, 'span.context.destination.service.resource')
  t.equal(span.context.destination.address, u.hostname, 'span.context.destination.address')
  t.equal(span.context.destination.port, Number(u.port), 'span.context.destination.port')
}

// ---- tests

test('setup', t => {
  server = http.createServer((req, res) => {
    lastServerReq = req
    req.resume()
    req.on('end', () => {
      setTimeout(() => {
        res.end('pong')
      }, 10)
    })
  })
  server.listen(() => {
    origin = `http://localhost:${server.address().port}`
    t.end()
  })
})

test('undici.request', async t => {
  apm._transport.clear()
  const aTrans = apm.startTransaction('aTransName')

  const url = origin + '/ping'
  const { statusCode, body } = await undici.request(url)
  t.equal(statusCode, 200, 'statusCode')
  await consumeResponseBody(body)

  aTrans.end()
  t.error(await promisyApmFlush(), 'no apm.flush() error')

  t.equal(apm._transport.spans.length, 1)
  const span = apm._transport.spans[0]
  assertUndiciSpan(t, span, url)

  // Test trace-context propagation.
  t.equal(lastServerReq.headers.traceparent,
    `00-${span.trace_id}-${span.id}-01`,
    'serverReq.headers.traceparent')
  t.equal(lastServerReq.headers.tracestate, 'es=s:1', 'serverReq.headers.tracestate')

  t.end()
})

test('undici.stream', async t => {
  apm._transport.clear()
  const aTrans = apm.startTransaction('aTransName')

  // https://undici.nodejs.org/#/docs/api/Dispatcher?id=example-1-basic-get-stream-request
  const url = origin + '/ping'
  const chunks = []
  await undici.stream(
    url,
    { opaque: { chunks } },
    ({ statusCode, opaque: { chunks } }) => {
      t.equal(statusCode, 200, 'statusCode')
      return new Writable({
        write (chunk, _encoding, cb) {
          chunks.push(chunk)
          cb()
        }
      })
    }
  )
  t.equal(chunks.join(''), 'pong', 'response body')

  aTrans.end()
  t.error(await promisyApmFlush(), 'no apm.flush() error')

  t.equal(apm._transport.spans.length, 1)
  const span = apm._transport.spans[0]
  assertUndiciSpan(t, span, url)

  t.end()
})

if (undici.fetch) {
  test('undici.fetch', async t => {
    apm._transport.clear()
    const aTrans = apm.startTransaction('aTransName')

    const url = origin + '/ping'
    const res = await undici.fetch(url)
    t.equal(res.status, 200, 'res.status')
    const text = await res.text()
    t.equal(text, 'pong', 'response body')

    aTrans.end()
    t.error(await promisyApmFlush(), 'no apm.flush() error')

    t.equal(apm._transport.spans.length, 1)
    const span = apm._transport.spans[0]
    assertUndiciSpan(t, span, url)

    t.end()
  })
}

if (global.AbortController) {
  test('undici.request AbortSignal', async t => {
    apm._transport.clear()
    const aTrans = apm.startTransaction('aTransName', 'manual')

    const url = origin + '/ping'
    const ac = new AbortController() // eslint-disable-line no-undef
    setTimeout(() => {
      ac.abort()
    }, 5) // Abort before the ~10ms expected response time of the request.
    try {
      await undici.request(url, { signal: ac.signal })
      t.fail('should not get here')
    } catch (reqErr) {
      t.ok(reqErr, 'got a request error')

      aTrans.end()
      t.error(await promisyApmFlush(), 'no apm.flush() error')

      t.equal(apm._transport.spans.length, 1)
      const span = apm._transport.spans[0]
      assertUndiciSpan(t, span, url, true)

      t.equal(apm._transport.errors.length, 1)
      const error = apm._transport.errors[0]
      t.equal(error.parent_id, span.id, 'error.parent_id')
      t.equal(error.trace_id, span.trace_id, 'error.trace_id')
      t.equal(error.transaction_id, aTrans.id, 'error.transaction_id')
      t.deepEqual(error.transaction, { name: 'aTransName', type: 'manual', sampled: true }, 'error.transaction')
      t.equal(error.exception.message, 'Request aborted', 'error.exception.message')
      t.equal(error.exception.type, 'AbortError', 'error.exception.type')
      t.equal(error.exception.code, 'UND_ERR_ABORTED', 'error.exception.code')
      t.equal(error.exception.module, 'undici', 'error.exception.module')
      t.equal(error.exception.handled, true, 'error.exception.handled')

      t.end()
    }
  })
}

test('teardown', t => {
  undici.getGlobalDispatcher().close() // Close kept-alive sockets.
  server.close()
  t.end()
})
