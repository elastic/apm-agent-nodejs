'use strict'

setTimeout(require('why-is-node-running'), 60 * 1000)

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
var eventDebug = require('event-debug')

var fileSize = fs.readFileSync(__filename, 'utf8').length

test('https://github.com/elastic/apm-agent-nodejs/issues/423', function (t) {
  // Start dummy remote server to fetch gzip'ed data from
  var remote = http.createServer(function (req, res) {
    eventDebug(req, 'server1: req')
    eventDebug(res, 'server1: res')
    res.setHeader('Content-Encoding', 'gzip')
    fs.createReadStream(__filename).pipe(zlib.createGzip()).pipe(res)
  })
  eventDebug(remote, 'server1')

  remote.listen(function () {
    var port = remote.address().port
    var url = 'http://localhost:' + port

    // Start simple server that performs got-request on every request
    var server = http.createServer(function (req, res) {
      eventDebug(req, 'server2: req')
      eventDebug(res, 'server2: res')
      got(url).then(function (response) {
        t.equal(response.body.length, fileSize, 'body should be expected size')
        t.equal(response.body.slice(0, 12), '\'use strict\'', 'body should be uncompressed')
        res.end()
      })
    })
    eventDebug(remote, 'server2')

    server.listen(function () {
      var port = server.address().port
      var url = 'http://localhost:' + port

      var req = http.get(url, function (res) {
        eventDebug(res, 'outgoing req: res')
        res.resume()
        server.close()
        remote.close()
        t.end()
      })
      eventDebug(req, 'outgoing req')
    })
  })
})
