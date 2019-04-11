'use strict'

const agent = require('../../../..').start({
  captureExceptions: false
})

{
  const semver = require('semver')
  const version = require('fastify/package').version
  if (semver.lt(process.version, '6.0.0') && semver.gte(version, '1.0.0')) process.exit()
}

const http = require('http')

const Fastify = require('fastify')
const test = require('tape')

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

  fastify.get('/hello/:name', function (request, reply) {
    reply.send({ hello: request.params.name })
  })

  fastify.listen(0, function (err) {
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
        t.equal(result, '{"hello":"world"}', 'got correct body')
        agent.flush()
        fastify.close()
      })
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
