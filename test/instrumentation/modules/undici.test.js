/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

process.env.ELASTIC_APM_TEST = true
const { CapturingTransport } = require('../../_capturing_transport')
const apm = require('../../..').start({
  serviceName: 'test-undici',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
  transport () { return new CapturingTransport() }
})

// Skip (exit the process) if this undici doesn't support this node version.
const semver = require('semver')
if (semver.lt(process.version, '14.7.0')) {
  console.log(`# SKIP undici instrumention does not support node ${process.version}`)
  process.exit()
}

const http = require('http')
const { promisify } = require('util')
const test = require('tape')
const undici = require('undici')

const promisyApmFlush = promisify(apm.flush.bind(apm))
let server
let origin
let lastServerReq

test('setup', t => {
  server = http.createServer((req, res) => {
    lastServerReq = req
    req.resume()
    req.on('end', () => {
      res.end('pong')
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
  const u = new URL(url)
  const { statusCode, body } = await undici.request(url)
  console.log('response received', statusCode)
  t.equal(statusCode, 200, 'statusCode')
  // Consume req body, because https://github.com/nodejs/undici#garbage-collection
  for await (const _chunk of body) { } // eslint-disable-line no-unused-vars

  aTrans.end()
  t.error(await promisyApmFlush())

  t.equal(apm._transport.spans.length, 1)
  const span = apm._transport.spans[0]
  t.equal(span.name, `GET ${u.host}`, 'span.name')
  t.equal(span.type, 'external', 'span.type')
  t.equal(span.subtype, 'http', 'span.subtype')
  t.equal(span.action, 'GET', 'span.action')
  t.equal(span.outcome, 'success', 'span.outcome')
  t.equal(span.context.http.method, 'GET', 'span.context.http.method')
  t.equal(span.context.http.url, url, 'span.context.http.url')
  t.equal(span.context.http.status_code, 200, 'span.context.http.status_code')
  t.equal(span.context.http.response.encoded_body_size, 4, 'span.context.http.response.encoded_body_size')
  t.equal(span.context.destination.service.name, '', 'span.context.destination.service.name')
  t.equal(span.context.destination.service.type, '', 'span.context.destination.service.type')
  t.equal(span.context.destination.service.resource, u.host, 'span.context.destination.service.resource')
  t.equal(span.context.destination.address, u.hostname, 'span.context.destination.address')
  t.equal(span.context.destination.port, Number(u.port), 'span.context.destination.port')
  t.equal(lastServerReq.headers.traceparent,
    `00-${span.trace_id}-${span.id}-01`,
    'serverReq.headers.traceparent')
  t.equal(lastServerReq.headers.tracestate, 'es=s:1', 'serverReq.headers.tracestate')

  t.end()
})

test('teardown', t => {
  undici.getGlobalDispatcher().close() // Close kept-alive sockets.
  server.close()
  t.end()
})
