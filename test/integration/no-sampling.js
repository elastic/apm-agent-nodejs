'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false,
    flushInterval: 1
  })

  var http = require('http')
  var zlib = require('zlib')
  var test = require('tape')

  test('should not sample', function (t) {
    var server = http.createServer(function (req, res) {
      var buffers = []
      var gunzip = zlib.createGunzip()
      var unzipped = req.pipe(gunzip)

      unzipped.on('data', buffers.push.bind(buffers))
      unzipped.on('end', function () {
        res.end()
        server.close()
        var data = JSON.parse(Buffer.concat(buffers))
        t.equal(data.transactions.length, 20, 'expect 20 transactions to be sent')
        t.end()
      })
    })

    server.listen(port, makeManyTransactions)
  })

  function makeManyTransactions (n) {
    n = n || 0
    if (++n > 20) return
    makeTransaction(makeManyTransactions.bind(null, n))
  }

  function makeTransaction (cb) {
    var trans = agent.startTransaction('foo', 'bar')
    setTimeout(function () {
      trans.end()
      process.nextTick(cb)
    }, 10)
  }
}, function (err) {
  throw err
})
