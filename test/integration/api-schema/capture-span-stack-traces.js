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
    captureSpanStackTraces: false
  })

  const http = require('http')
  const zlib = require('zlib')
  const test = require('tape')
  const utils = require('./_utils')

  test('POST /transactions - captureSpanStackTraces: false', function (t) {
    t.plan(7)

    utils.transactionsValidator(function (err, validate) {
      t.error(err)

      const server = http.createServer(function (req, res) {
        t.equal(req.method, 'POST')
        t.equal(req.url, '/v1/transactions')

        const buffers = []
        const gunzip = zlib.createGunzip()
        const unzipped = req.pipe(gunzip)

        unzipped.on('data', buffers.push.bind(buffers))
        unzipped.on('end', function () {
          res.end()
          server.close()
          const data = JSON.parse(Buffer.concat(buffers))
          t.equal(data.transactions.length, 1, 'expect 1 transaction to be sent')
          const valid = validate(data)
          t.equal(validate.errors, null, 'should not have any validation errors')
          t.equal(valid, true, 'should be valid')
        })
      })

      server.listen(port, function () {
        agent.startTransaction('name1', 'type1')
        const span = agent.startSpan('name1', 'type1')
        span.end()
        agent.endTransaction()
        agent.flush(function (err) {
          server.close()
          t.error(err)
        })
      })
    })
  })
}, function (err) {
  throw err
})
