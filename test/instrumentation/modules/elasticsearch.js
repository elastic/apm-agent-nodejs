'use strict'

process.env.ELASTIC_APM_TEST = true
var host = (process.env.ES_HOST || 'localhost') + ':9200'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var elasticsearch = require('elasticsearch')

test('client.ping with callback', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo1')

  var client = new elasticsearch.Client({host: host})

  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  })
})

test('client.ping with promise', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo2')

  var client = new elasticsearch.Client({host: host})

  client.ping().then(function () {
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  }, function (err) {
    t.error(err)
  })
})

test('client.search with callback', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_search', '{"q":"pants"}'))

  agent.startTransaction('foo3')

  var client = new elasticsearch.Client({host: host})
  var query = {q: 'pants'}

  client.search(query, function (err) {
    t.error(err)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  })
})

function done (t, method, path, query) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.ok(/^foo\d$/.test(trans.name))
    t.equal(trans.type, 'custom')

    t.equal(trans.spans.length, 2)

    t.equal(trans.spans[0].name, method + ' ' + host + path)
    t.equal(trans.spans[0].type, 'ext.http.http')

    t.equal(trans.spans[1].name, 'Elasticsearch: ' + method + ' ' + path)
    t.equal(trans.spans[1].type, 'db.elasticsearch.request')
    t.ok(trans.spans[1].stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')
    t.deepEqual(trans.spans[1].context.db, {statement: query || '{}', type: 'elasticsearch'})

    t.ok(trans.spans[0].start > trans.spans[1].start, 'http span should start after elasticsearch span')
    t.ok(trans.spans[0].start + trans.spans[0].duration < trans.spans[1].start + trans.spans[1].duration, 'http span should end before elasticsearch span')

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
