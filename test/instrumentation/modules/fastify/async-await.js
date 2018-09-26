'use strict'

const agent = require('../../../..').start({
  captureExceptions: false
})

const semver = require('semver')

// Only Node.js v7.6.0+ supports async/await without a flag
if (semver.lt(process.version, '7.6.0')) process.exit()

const http = require('http')

const Fastify = require('fastify')
const test = require('tape')

const fastifyVersion = require('fastify/package').version

const mockClient = require('../../../_mock_http_client')

test('transaction name', function (t) {
  resetAgent(data => {
    t.equal(data.transactions.length, 1, 'has a transaction')

    const trans = data.transactions[0]
    t.equal(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    t.equal(trans.type, 'request', 'transaction type is request')
    t.end()
  })

  const fastify = Fastify()

  fastify.get('/hello/:name', async (request, reply) => {
    return { hello: request.params.name }
  })

  fastify.listen(0, function (err, address) {
    t.error(err)
    http.get(`${address}/hello/world`, function (res) {
      const chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        const result = Buffer.concat(chunks).toString()
        t.equal(result, '{"hello":"world"}', 'got correct body')
        agent.flush()
        fastify.close()
      })
    })
  })
})

if (semver.gte(fastifyVersion, '2.0.0-rc')) {
  test('error reporting', function (t) {
    resetAgent(data => {
      t.ok(errored, 'reported an error')
      t.equal(data.transactions.length, 1, 'has a transaction')

      const trans = data.transactions[0]
      t.equal(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
      t.equal(trans.type, 'request', 'transaction type is request')
      t.end()
    })

    let request
    let errored = false
    const error = new Error('wat')
    const captureError = agent.captureError
    agent.captureError = function (err, data) {
      t.equal(err, error, 'has the expected error')
      t.ok(data, 'captured data with error')
      t.equal(data.request, request, 'captured data has the request object')
      errored = true
    }
    t.on('end', function () {
      agent.captureError = captureError
    })

    const fastify = Fastify()

    fastify.get('/hello/:name', async (_request, reply) => {
      request = _request.raw
      throw error
    })

    fastify.listen(0, function (err, address) {
      t.error(err)
      http.get(`${address}/hello/world`, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          const result = JSON.parse(Buffer.concat(chunks).toString())
          t.deepEqual(result, {
            error: 'Internal Server Error',
            message: 'wat',
            statusCode: 500
          }, 'got correct body')
          agent.flush()
          fastify.close()
        })
      })
    })
  })
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
