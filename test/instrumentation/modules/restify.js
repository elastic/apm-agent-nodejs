'use strict'

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

const http = require('http')

const once = require('once')
const restify = require('restify')
const test = require('tape')

const mockClient = require('../../_mock_http_client')

test('transaction name', function (t) {
  resetAgent((data) => {
    t.equal(data.transactions.length, 1, 'has a transaction')

    const trans = data.transactions[0]
    t.equal(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    t.equal(trans.type, 'request', 'transaction type is request')
    t.end()
  })

  const server = restify.createServer()
  const done = once(() => {
    server.close()
  })
  t.on('end', done)

  server.get('/hello/:name', (req, res, next) => {
    res.send({
      message: 'hello ' + req.params.name
    })
    next()
  })

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(null, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, res => {
      const chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', () => {
        const result = Buffer.concat(chunks).toString()
        const json = JSON.parse(result)
        t.deepEqual(json, {
          message: 'hello world'
        }, 'got correct body')
        agent.flush()
        done()
      })
    })
    req.end()
  })
})

test('error reporting', function (t) {
  resetAgent((data) => {
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

  const server = restify.createServer()
  const done = once(() => {
    server.close()
  })
  t.on('end', done)

  server.get('/hello/:name', (req, res, next) => {
    request = req
    next(error)
  })

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(null, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, res => {
      res.resume()
      res.on('end', () => {
        agent.flush()
        done()
      })
    })
    req.end()
  })
})

test('error reporting from chained handler', function (t) {
  resetAgent((data) => {
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

  const server = restify.createServer()
  const done = once(() => {
    server.close()
  })
  t.on('end', done)

  server.get('/hello/:name', (req, res, next) => {
    next()
  }, (req, res, next) => {
    request = req
    next(error)
  })

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(null, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, res => {
      res.resume()
      res.on('end', () => {
        agent.flush()
        done()
      })
    })
    req.end()
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
