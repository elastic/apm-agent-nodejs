/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const zlib = require('zlib')
const http = require('http')
const PassThrough = require('stream').PassThrough

const mimicResponse = require('mimic-response')
const test = require('tape')

const echoServer = require('./_echo_server_util').echoServer

test('https://github.com/opbeat/opbeat-node/issues/179', function (t) {
  echoServer(function (cp, port) {
    const opts = {
      port: port,
      headers: { 'Accept-Encoding': 'gzip' }
    }

    agent.startTransaction()

    const req = http.request(opts, function (res) {
      process.nextTick(function () {
        const unzip = zlib.createUnzip()
        const stream = new PassThrough()

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
