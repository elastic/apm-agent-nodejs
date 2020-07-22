'use strict'

const agent = require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const http = require('http')

const AWS = require('aws-sdk')
const test = require('tape')

AWS.config.update({
  accessKeyId: 'foo',
  secretAccessKey: 'bar'
})

test('non aws-sdk request', function (t) {
  const server = http.createServer(function (req, res) {
    t.strictEqual(req.headers.authorization, undefined, 'no authorization header')
    t.ok(req.headers.traceparent.length > 0, 'traceparent header')
    t.ok(req.headers['elastic-apm-traceparent'].length > 0, 'elastic-apm-traceparent header')
    res.end()
    server.close()
    t.end()
  })

  server.listen(function () {
    const port = server.address().port

    agent.startTransaction()

    const req = http.request({ port }, function (res) {
      res.resume()
    })
    req.end()
  })
})

test('aws-sdk request', function (t) {
  const server = http.createServer(function (req, res) {
    t.strictEqual(req.headers.authorization.substr(0, 5), 'AWS4-', 'AWS authorization header')
    t.strictEqual(req.headers.traceparent, undefined, 'no traceparent header')
    t.strictEqual(req.headers['elastic-apm-traceparent'], undefined, 'no elastic-apm-traceparent header')
    res.end()
    server.close()
    t.end()
  })

  server.listen(function () {
    const port = server.address().port
    const endpoint = new AWS.Endpoint('http://localhost:' + port)
    const s3 = new AWS.S3({ endpoint })

    agent.startTransaction()

    s3.listBuckets(function (err, data) {
      if (err) throw err
    })
  })
})
