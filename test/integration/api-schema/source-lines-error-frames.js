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

const next = afterAll(function (err, validators) {
  if (err) throw err

  const [validateMetadata, validateError] = validators

  const errors = [
    new Error('foo'),
    'just a string'
  ]
  errors.forEach(function (error, index) {
    test('errors schema - sourceLinesErrorAppFrames: 0, sourceLinesErrorLibraryFrames: 0 - ' + index, function (t) {
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
          t.error(err)
        })
      })
    })
  })
})

utils.metadataValidator(next())
utils.errorValidator(next())

function newAgent (server) {
  return new Agent().start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + server.address().port,
    captureExceptions: false,
    disableInstrumentations: ['http'],
    sourceLinesErrorAppFrames: 0,
    sourceLinesErrorLibraryFrames: 0
  })
}
