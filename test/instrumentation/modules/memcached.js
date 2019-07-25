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
    t.equal(data.spans[0].name, 'memcached.set')
    t.equal(data.spans[0].type, 'db.memcached.set')
    t.equal(data.spans[0].context.db.statement, 'set foo')
    t.equal(data.spans[1].name, 'memcached.get')
    t.equal(data.spans[1].type, 'db.memcached.get')
    t.equal(data.spans[1].context.db.statement, 'get foo')
    t.equal(data.spans[2].name, 'memcached.replace')
    t.equal(data.spans[2].type, 'db.memcached.replace')
    t.equal(data.spans[2].context.db.statement, 'replace foo')
    t.equal(data.spans[3].name, 'memcached.get')
    t.equal(data.spans[3].type, 'db.memcached.get')
    t.equal(data.spans[3].context.db.statement, 'get foo')
    t.equal(data.spans[4].name, 'memcached.touch')
    t.equal(data.spans[4].type, 'db.memcached.touch')
    t.equal(data.spans[4].context.db.statement, 'touch foo')
    t.equal(data.spans[5].name, 'memcached.delete')
    t.equal(data.spans[5].type, 'db.memcached.delete')
    t.equal(data.spans[5].context.db.statement, 'delete foo')
    t.equal(data.spans[6].name, 'memcached.get')
    t.equal(data.spans[6].type, 'db.memcached.get')
    t.equal(data.spans[6].context.db.statement, 'get foo')
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

function resetAgent(cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(8, cb)
  agent.captureError = function (err) { throw err }
}
