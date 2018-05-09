'use strict'

if (require('os').platform() === 'win32') {
  console.log('This test file does not support Windows - aborting...')
  process.exit()
}

const getPort = require('get-port')

getPort().then(function (port) {
  const agent = require('../../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false,
    captureErrorLogStackTraces: true
  })

  const http = require('http')
  const zlib = require('zlib')
  const test = require('tape')
  const utils = require('./_utils')

  const errors = [
    new Error('foo'),
    'just a string'
  ]
  errors.forEach(function (error, index) {
    test('POST /errors - captureErrorLogStackTraces: true - ' + index, function (t) {
      t.plan(7)

      utils.errorsValidator(function (err, validate) {
        t.error(err)

        const server = http.createServer(function (req, res) {
          t.equal(req.method, 'POST')
          t.equal(req.url, '/v1/errors')

          const buffers = []
          const gunzip = zlib.createGunzip()
          const unzipped = req.pipe(gunzip)

          unzipped.on('data', buffers.push.bind(buffers))
          unzipped.on('end', function () {
            res.end()
            server.close()
            const data = JSON.parse(Buffer.concat(buffers))
            t.equal(data.errors.length, 1, 'expect 1 error to be sent')
            const valid = validate(data)
            t.equal(validate.errors, null, 'should not have any validation errors')
            t.equal(valid, true, 'should be valid')
          })
        })

        server.listen(port, function () {
          agent.captureError(error, function (err) {
            server.close()
            t.error(err)
          })
        })
      })
    })
  })
}, function (err) {
  throw err
})
