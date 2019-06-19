'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0
})

var test = require('tape')
var mockClient = require('../../_mock_http_client')
test(function (t) {
  resetAgent(function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 7)
    for (var span of data.spans) {
      t.ok(/^memcached\.(get|set|replace|touch|delete)$/.test(span.name))
      t.ok(/^db\.memcached\.(get|set|replace|touch|delete)$/.test(span.type))
      t.ok(/^(get|set|replace|touch|delete) foo$/.test(span.context.db.statement))
    }
    t.end()
  })
  var Memcached = require('memcached')
  var cache = new Memcached(`${process.env.MEMCACHED_HOST || '127.0.0.1'}:11211`, { timeout: 500 })
  agent.startTransaction('foo', 'bar')
  cache.set('foo', 'bar', 300, (err) => {
    t.error(err)
    cache.get('foo', (err, data) => {
      t.error(err)
      t.equal(data, 'bar')
      cache.replace('foo', 'fizz', 300, (err) => {
        t.error(err)
        cache.get('foo', (err, data) => {
          t.error(err)
          t.equal(data, 'fizz')
          cache.touch('foo', 300, (err) => {
            t.error(err)
            cache.del('foo', (err) => {
              t.error(err)
              cache.get('foo', (err, data) => {
                t.error(err)
                t.equal(data, undefined)
                agent.endTransaction()
                agent.flush()
              })
            })
          })
        })
      })
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(8, cb)
  agent.captureError = function (err) { throw err }
}
