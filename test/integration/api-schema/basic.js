'use strict'

if (require('os').platform() === 'win32') {
  console.log('This test file does not support Windows - aborting...')
  process.exit()
}

const http = require('http')
const zlib = require('zlib')

const afterAll = require('after-all-results')
const ndjson = require('ndjson')
const test = require('tape')

const utils = require('./_utils')
const Agent = require('../../_agent')
const findObjInArray = require('../../_utils').findObjInArray

process.env.ELASTIC_APM_METRICS_INTERVAL = '0'

const next = afterAll(function (err, validators) {
  if (err) throw err

  const [validateMetadata, validateTransaction, validateSpan, validateError] = validators

  test('metadata schema failure', function (t) {
    t.equal(validateMetadata({}), false)
    validateFieldMessages(t, validateMetadata.errors, [
      { field: 'data.service', message: 'is required' }
    ])
    t.end()
  })

  test('transaction schema failure', function (t) {
    t.equal(validateTransaction({}), false)
    validateFieldMessages(t, validateTransaction.errors, [
      { field: 'data.duration', message: 'is required' },
      { field: 'data.type', message: 'is required' },
      { field: 'data.id', message: 'is required' },
      { field: 'data.trace_id', message: 'is required' },
      { field: 'data.span_count', message: 'is required' }
    ])
    t.end()
  })

  test('span schema failure', function (t) {
    t.equal(validateSpan({}), false)
    validateFieldMessages(t, validateSpan.errors, [
      { field: 'data.duration', message: 'is required' },
      { field: 'data.name', message: 'is required' },
      { field: 'data.type', message: 'is required' },
      { field: 'data.id', message: 'is required' },
      { field: 'data.transaction_id', message: 'is required' },
      { field: 'data.trace_id', message: 'is required' },
      { field: 'data.parent_id', message: 'is required' },
      { field: 'data', message: 'no schemas match' }
    ])
    t.end()
  })

  test('error schema failure', function (t) {
    t.equal(validateError({}), false)
    validateFieldMessages(t, validateError.errors, [
      { field: 'data', message: 'no schemas match' },
      { field: 'data.id', message: 'is required' }
    ])
    t.equal(validateError({ id: 'foo', exception: {} }), false)
    validateFieldMessages(t, validateError.errors, [
      { field: 'data.exception', message: 'no schemas match' }
    ])
    t.equal(validateError({ id: 'foo', log: {} }), false)
    validateFieldMessages(t, validateError.errors, [
      { field: 'data.log.message', message: 'is required' }
    ])
    t.end()
  })

  test('metadata + transaction schema', function (t) {
    t.plan(7)

    let agent
    const validators = [validateMetadata, validateTransaction]

    const server = http.createServer(function (req, res) {
      t.equal(req.method, 'POST', 'server should recieve a POST request')
      t.equal(req.url, '/intake/v2/events', 'server should recieve request to correct endpoint')

      req
        .pipe(zlib.createGunzip())
        .pipe(ndjson.parse())
        .on('data', function (data) {
          const type = Object.keys(data)[0]
          const validate = validators.shift()
          t.equal(validate(data[type]), true, type + ' should be valid')
          t.equal(validate.errors, null, type + ' should not have any validation errors')
        })
        .on('end', function () {
          res.end()
          server.close()
          agent.destroy()
          t.end()
        })
    })

    server.listen(function () {
      agent = newAgent(server)
      agent.startTransaction('name1', 'type1')
      agent.endTransaction()
      agent.flush(function (err) {
        t.error(err, 'flush should not result in an error')
      })
    })
  })

  test('metadata + span schema', function (t) {
    t.plan(7)

    let agent
    const validators = [validateMetadata, validateSpan]

    const server = http.createServer(function (req, res) {
      t.equal(req.method, 'POST', 'server should recieve a POST request')
      t.equal(req.url, '/intake/v2/events', 'server should recieve request to correct endpoint')

      req
        .pipe(zlib.createGunzip())
        .pipe(ndjson.parse())
        .on('data', function (data) {
          const type = Object.keys(data)[0]
          const validate = validators.shift()
          t.equal(validate(data[type]), true, type + ' should be valid')
          t.equal(validate.errors, null, type + ' should not have any validation errors')
        })
        .on('end', function () {
          res.end()
          server.close()
          agent.destroy()
          t.end()
        })
    })

    server.listen(function () {
      agent = newAgent(server)
      agent.startTransaction()
      const span = agent.startSpan('name1', 'type1')
      span.setDbContext({ statement: 'foo', type: 'bar' })
      span.setTag('baz', 1)
      span.end()
      // Collecting the span stack trace is an async process. Wait a little before flushing
      setTimeout(function () {
        agent.flush(function (err) {
          t.error(err, 'flush should not result in an error')
        })
      }, 250)
    })
  })

  const errors = [
    new Error('foo'),
    'just a string'
  ]
  errors.forEach(function (error, index) {
    test('metadata + error schema - ' + index, function (t) {
      t.plan(7)

      let agent
      const validators = [validateMetadata, validateError]

      const server = http.createServer(function (req, res) {
        t.equal(req.method, 'POST', 'server should recieve a POST request')
        t.equal(req.url, '/intake/v2/events', 'server should recieve request to correct endpoint')

        req
          .pipe(zlib.createGunzip())
          .pipe(ndjson.parse())
          .on('data', function (data) {
            const type = Object.keys(data)[0]
            const validate = validators.shift()
            t.equal(validate(data[type]), true, type + ' should be valid')
            t.equal(validate.errors, null, type + ' should not have any validation errors')
          })
          .on('end', function () {
            res.end()
            server.close()
            agent.destroy()
            t.end()
          })
      })

      server.listen(function () {
        agent = newAgent(server)
        agent.captureError(error, function (err) {
          t.error(err, 'captureError should not result in an error')
        })
      })
    })
  })
})

utils.metadataValidator(next())
utils.transactionValidator(next())
utils.spanValidator(next())
utils.errorValidator(next())

function validateFieldMessages (t, errors, expectations) {
  t.equal(errors.length, expectations.length)
  expectations.forEach(expected => {
    const field = findObjInArray(errors, 'field', expected.field)
    t.equal(field.message, expected.message)
  })
}

function newAgent (server) {
  return new Agent().start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + server.address().port,
    captureExceptions: false,
    disableInstrumentations: ['http']
  })
}
