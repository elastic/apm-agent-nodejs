/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../../..').start({
  serviceName: 'test-fastify',
  captureExceptions: false,
  metricsInterval: '0s',
  centralConfig: false,
  apmServerVersion: '8.7.0',
  captureBody: 'all'
})

const isFastifyIncompat = require('../../../_is_fastify_incompat')()
if (isFastifyIncompat) {
  console.log(`# SKIP ${isFastifyIncompat}`)
  process.exit()
}

const http = require('http')

const Fastify = require('fastify')
const test = require('tape')

const mockClient = require('../../../_mock_http_client')

test('transaction name', function (t) {
  t.plan(5)

  resetAgent(data => {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    const trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  const fastify = Fastify()

  fastify.get('/hello/:name', function (request, reply) {
    reply.send({ hello: request.params.name })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)

    // build the URL manually as older versions of fastify doesn't supply it as
    // an argument to the callback
    const port = fastify.server.address().port
    const url = 'http://localhost:' + port + '/hello/world'

    http.get(url, function (res) {
      const chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        const result = Buffer.concat(chunks).toString()
        t.strictEqual(result, '{"hello":"world"}', 'got correct body')
        agent.flush()
        fastify.close()
        t.end()
      })
    })
  })
})

test('captureBody', function (t) {
  t.plan(9)

  const postData = JSON.stringify({ foo: 'bar' })

  resetAgent(data => {
    t.strictEqual(data.transactions.length, 1)
    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'POST /postSomeData', 'transaction.name')
    t.strictEqual(trans.type, 'request', 'transaction.type')
    t.strictEqual(trans.result, 'HTTP 2xx', 'transaction.result')
    t.strictEqual(trans.context.request.method, 'POST', 'transaction.context.request.method')
    t.equal(trans.context.request.body, postData, 'transaction.context.request.body')
    fastify.close()
  })

  var fastify = Fastify()

  fastify.post('/postSomeData', (request, reply) => {
    reply.send('your data has been posted')
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)

    // build the URL manually as older versions of fastify doesn't supply it as
    // an argument to the callback
    const port = fastify.server.address().port
    const cReq = http.request(
      {
        method: 'POST',
        hostname: 'localhost',
        port,
        path: '/postSomeData',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      function (res) {
        t.strictEqual(res.statusCode, 200)
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'your data has been posted')
        })
        res.on('end', function () {
          agent.flush()
          t.end()
        })
      }
    )
    cReq.write(postData)
    cReq.end()
  })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
