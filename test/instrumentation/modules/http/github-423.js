'use strict'

require('../../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0
})

var http = require('http')
var zlib = require('zlib')
var fs = require('fs')
var semver = require('semver')
var test = require('tape')

var version = require('got/package').version
if (semver.gte(version, '9.0.0') && semver.lt(process.version, '8.3.0')) process.exit() // got@9.0.0 requires Node.js 8.3 or higher
var got = require('got')

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
        t.equal(response.body.length, fileSize, 'body should be expected size')
        t.equal(response.body.slice(0, 12), '\'use strict\'', 'body should be uncompressed')
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
