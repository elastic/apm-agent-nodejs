'use strict'

// Memcached isn't supported on Windows
if (process.platform === 'win32') process.exit()

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

    const spans = data.spans.sort((a, b) => {
      return a.timestamp - b.timestamp
    })

    t.equal(spans[0].name, 'memcached.set')
    t.equal(spans[0].type, 'db.memcached.set')
    t.equal(spans[0].context.db.statement, 'set foo')
    t.equal(spans[1].name, 'memcached.get')
    t.equal(spans[1].type, 'db.memcached.get')
    t.equal(spans[1].context.db.statement, 'get foo')
    t.equal(spans[2].name, 'memcached.replace')
    t.equal(spans[2].type, 'db.memcached.replace')
    t.equal(spans[2].context.db.statement, 'replace foo')
    t.equal(spans[3].name, 'memcached.get')
    t.equal(spans[3].type, 'db.memcached.get')
    t.equal(spans[3].context.db.statement, 'get foo')
    t.equal(spans[4].name, 'memcached.touch')
    t.equal(spans[4].type, 'db.memcached.touch')
    t.equal(spans[4].context.db.statement, 'touch foo')
    t.equal(spans[5].name, 'memcached.delete')
    t.equal(spans[5].type, 'db.memcached.delete')
    t.equal(spans[5].context.db.statement, 'delete foo')
    t.equal(spans[6].name, 'memcached.get')
    t.equal(spans[6].type, 'db.memcached.get')
    t.equal(spans[6].context.db.statement, 'get foo')
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
                cache.end()
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
