/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

require('../../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var http = require('http')
var zlib = require('zlib')
var fs = require('fs')

var got = require('got')
var test = require('tape')

var fileSize = fs.readFileSync(__filename, 'utf8').length

test('https://github.com/elastic/apm-agent-nodejs/issues/423', function (t) {
  // Start dummy remote server to fetch gzip'ed data from
  var remote = http.createServer(function (req, res) {
    res.setHeader('Content-Encoding', 'gzip')
    fs.createReadStream(__filename).pipe(zlib.createGzip()).pipe(res)
  })

  remote.listen(function () {
    var port = remote.address().port
    var url = 'http://localhost:' + port

    // Start simple server that performs got-request on every request
    var server = http.createServer(function (req, res) {
      got(url).then(function (response) {
        t.strictEqual(response.body.length, fileSize, 'body should be expected size')
        t.strictEqual(response.body.slice(0, 12), '/*\n * Copyri', 'body should be uncompressed')
        res.end()
      })
    })

    server.listen(function () {
      var port = server.address().port
      var url = 'http://localhost:' + port

      http.get(url, function (res) {
        res.resume()
        server.close()
        remote.close()
        t.end()
      })
    })
  })
})
