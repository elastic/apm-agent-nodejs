'use strict'

process.env.ELASTIC_APM_TEST = true
var host = (process.env.ES_HOST || 'localhost') + ':9200'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var elasticsearch = require('elasticsearch')
var test = require('tape')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

test('client.ping with callback', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo1')

  var client = new elasticsearch.Client({ host: host })

  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.ping with promise', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo2')

  var client = new elasticsearch.Client({ host: host })

  client.ping().then(function () {
    agent.endTransaction()
    agent.flush()
  }, function (err) {
    t.error(err)
  })
})

test('client.search with callback', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_search', '{"q":"pants"}'))

  agent.startTransaction('foo3')

  var client = new elasticsearch.Client({ host: host })
  var query = { q: 'pants' }

  client.search(query, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.count with callback', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_count'))

  agent.startTransaction('foo3')

  var client = new elasticsearch.Client({ host: host })
  client.count(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

var searchRegexp = /_search$/
function done (t, method, path, query) {
  return function (data, cb) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)

    var trans = data.transactions[0]

    t.ok(/^foo\d$/.test(trans.name))
    t.equal(trans.type, 'custom')

    let span1 = findObjInArray(data.spans, 'subtype', 'http')
    t.equal(span1.type, 'ext', 'type should be ext')
    t.equal(span1.subtype, 'http', 'subtype should be http')
    t.equal(span1.action, 'http', 'action should be http')
    t.ok(span1, 'should have span with type ext.http.http')

    let span2 = findObjInArray(data.spans, 'subtype', 'elasticsearch')
    t.equal(span2.type, 'db', 'type should be db')
    t.equal(span2.subtype, 'elasticsearch', 'subtype should be elasticsearch')
    t.equal(span2.action, 'request', 'action should be request')
    t.ok(span2, 'should have span with type db.elasticsearch.request')

    t.equal(span1.name, method + ' ' + host + path)
    t.equal(span2.name, 'Elasticsearch: ' + method + ' ' + path)

    t.ok(span2.stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    if (searchRegexp.test(path)) {
      t.deepEqual(span2.context.db, { statement: query || '{}', type: 'elasticsearch' })
    } else {
      t.notOk(span2.context)
    }

    t.ok(span1.timestamp > span2.timestamp, 'http span should start after elasticsearch span')
    t.ok(span1.timestamp + span1.duration * 1000 < span2.timestamp + span2.duration * 1000, 'http span should end before elasticsearch span')

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(3, cb)
  agent.captureError = function (err) { throw err }
}
