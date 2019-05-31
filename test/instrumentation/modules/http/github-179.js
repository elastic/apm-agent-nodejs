'use strict'

var agent = require('../../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0
})

var zlib = require('zlib')
var http = require('http')
var PassThrough = require('stream').PassThrough

var mimicResponse = require('mimic-response')
var test = require('tape')

var echoServer = require('./_echo_server_util').echoServer

test('https://github.com/opbeat/opbeat-node/issues/179', function (t) {
  echoServer(function (cp, port) {
    var opts = {
      port: port,
      headers: { 'Accept-Encoding': 'gzip' }
    }

    agent.startTransaction()

    var req = http.request(opts, function (res) {
      process.nextTick(function () {
        var unzip = zlib.createUnzip()
        var stream = new PassThrough()

        // This would previously copy res.emit to the stream object which
        // shouldn't happen since res.emit is supposed to be on the res.prototype
        // chain (but was directly on the res object because it was wrapped).
        mimicResponse(res, stream)

        res.pipe(unzip).pipe(stream).pipe(new PassThrough())

        stream.on('end', function () {
          cp.kill()
          t.end()
        })
      })
    })

    req.end()
  })
})
