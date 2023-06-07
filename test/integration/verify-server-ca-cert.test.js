/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const getPort = require('get-port')

getPort().then(function (port) {
  const fs = require('fs')
  const path = require('path')

  const agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'https://localhost:' + port,
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    apmServerVersion: '8.0.0',
    disableInstrumentations: ['https'], // avoid the agent instrumenting the mock APM Server
    serverCaCertFile: path.join(__dirname, 'cert.pem') // self-signed certificate
  })

  const https = require('https')
  const test = require('tape')

  test('should allow self signed certificate', function (t) {
    t.plan(3)

    const cert = fs.readFileSync(path.join(__dirname, 'cert.pem'))
    const key = fs.readFileSync(path.join(__dirname, 'key.pem'))

    const server = https.createServer({ cert, key }, function (req, res) {
      t.pass('server received client request')
      res.end()
    })

    server.listen(port, function () {
      agent.captureError(new Error('boom!'), function (err) {
        t.error(err)
        t.pass('agent.captureError callback called')
        server.close()
        agent.destroy()
      })
    })
  })
}, function (err) {
  throw err
})
