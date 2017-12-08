'use strict'

var agent = require('../..').start({
  appName: 'test',
  captureExceptions: false,
  asyncHooks: true
})

var http = require('http')
var send = require('send')
var test = require('tape')

// run it 5 times in case of false positives due to race conditions
times(5, function (n, done) {
  test('https://github.com/elastic/apm-agent-nodejs/issues/75 ' + n, function (t) {
    resetAgent(function (endpoint, headers, data, cb) {
      t.equal(data.transactions.length, 2, 'should create transactions')
      data.transactions.forEach(function (trans) {
        t.equal(trans.spans.length, 1, 'transaction should have one span')
        t.equal(trans.spans[0].name, trans.id, 'span should belong to transaction')
      })
      server.close()
      t.end()
      done()
    })

    var server = http.createServer(function (req, res) {
      var span = agent.buildSpan()
      span.start(agent._instrumentation.currentTransaction.id)
      setTimeout(function () {
        span.end()
        send(req, __filename).pipe(res)
      }, 50)
    })

    var requestNo = 0

    server.listen(function () {
      request()
      request()
    })

    function request () {
      var port = server.address().port
      http.get('http://localhost:' + port, function (res) {
        res.on('end', function () {
          if (++requestNo === 2) {
            agent.flush()
          }
        })
        res.resume()
      })
    }
  })
})

function times (max, fn) {
  var n = 0
  run()
  function run () {
    if (++n > max) return
    fn(n, run)
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._instrumentation._queue._clear()
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
