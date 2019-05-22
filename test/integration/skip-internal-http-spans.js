'use strict'

const getPort = require('get-port')

const agent = require('../../')

getPort().then(port => {
  agent.start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false,
    metricsInterval: 0
  })

  const http = require('http')
  const zlib = require('zlib')
  const ndjson = require('ndjson')
  const test = require('tape')

  test('should not throw on socket close', t => {
    const seen = {
      metadata: 0,
      transaction: 0,
      span: 0,
      error: 0
    }

    const expected = {
      metadata: 1,
      transaction: 1,
      span: 0,
      error: 0
    }

    const server = http.createServer((req, res) => {
      req
        .pipe(zlib.createGunzip())
        .pipe(ndjson.parse())
        .on('data', data => {
          const key = Object.keys(data)[0]
          seen[key] = (seen[key] || 0) + 1
        })
        .on('end', () => res.end())
    })

    server.listen(port, () => {
      const trans = agent.startTransaction('transaction')
      trans.end()
      agent.flush(() => {
        setTimeout(() => {
          for (let key of Object.keys(expected)) {
            t.equal(seen[key], expected[key], `has expected value for ${key}`)
          }

          agent.flush(() => {
            setTimeout(() => {
              for (let key of Object.keys(expected)) {
                t.equal(seen[key], expected[key], `has expected value for ${key}`)
              }

              server.close()
              t.end()
            }, 100)
          })
        }, 100)
      })
    })
  })
})
