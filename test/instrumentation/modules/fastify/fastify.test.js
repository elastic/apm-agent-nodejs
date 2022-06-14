/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
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

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
