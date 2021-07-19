'use strict'

const { pathIsAQuery } = require('../../../lib/instrumentation/elasticsearch-shared')

process.env.ELASTIC_APM_TEST = true
var host = (process.env.ES_HOST || 'localhost') + ':9200'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanFramesMinDuration: -1 // always capture stack traces with spans
})

var elasticsearch = require('elasticsearch')
var pkg = require('elasticsearch/package.json')
var semver = require('semver')
var test = require('tape')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

test('client.ping with callback', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })

  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.ping with promise', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })

  client.ping().then(function () {
    agent.endTransaction()
    agent.flush()
  }, function (err) {
    t.error(err)
  })
})

test('client.search with callback', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_search', 'q=pants'))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })
  var query = { q: 'pants' }

  client.search(query, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.search with abort', function userLandCode (t) {
  resetAgent(3, done(t, 'POST', '/_search', 'q=pants', true))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })
  var query = { q: 'pants' }

  var req = client.search(query)

  setImmediate(() => {
    req.abort()
    agent.endTransaction()
    agent.flush()
  })
})

if (semver.satisfies(pkg.version, '>= 10')) {
  test('client.searchTemplate with callback', function userLandCode (t) {
    var body = {
      source: {
        query: {
          query_string: {
            query: '{{q}}'
          }
        }
      },
      params: {
        q: 'pants'
      }
    }

    resetAgent(done(t, 'POST', '/_search/template', JSON.stringify(body)))

    agent.startTransaction('foo')

    var client = new elasticsearch.Client({ host: host })

    client.searchTemplate({ body }, function (err) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
  })
}

if (semver.satisfies(pkg.version, '>= 13')) {
  test('client.msearch with callback', function userLandCode (t) {
    var body = [
      {},
      {
        query: {
          query_string: {
            query: 'pants'
          }
        }
      }
    ]

    var statement = body.map(JSON.stringify).join('\n')

    resetAgent(done(t, 'POST', '/_msearch', statement))

    agent.startTransaction('foo')

    var client = new elasticsearch.Client({ host: host })

    client.msearch({ body }, function (err) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
  })

  test('client.msearchTempate with callback', function userLandCode (t) {
    var body = [
      {},
      {
        source: {
          query: {
            query_string: {
              query: '{{q}}'
            }
          }
        },
        params: {
          q: 'pants'
        }
      }
    ]

    var statement = body.map(JSON.stringify).join('\n')

    resetAgent(done(t, 'POST', '/_msearch/template', statement))

    agent.startTransaction('foo')

    var client = new elasticsearch.Client({ host: host })

    client.msearchTemplate({ body }, function (err) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
  })
}

test('client.count with callback', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_count', ''))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })
  client.count(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

function done (t, method, path, query, abort = false) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1, 'should have 1 transaction')
    t.strictEqual(data.spans.length, 2, 'should have 2 spans')

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo', 'transaction name should be "foo"')
    t.strictEqual(trans.type, 'custom', 'transaction type should be "custom"')

    let span1, span2
    {
      const type = 'external'
      const subtype = 'http'
      const action = method
      span1 = findObjInArray(data.spans, 'type', type)
      t.ok(span1, 'should have span with type ' + type)
      t.strictEqual(span1.type, type)
      t.strictEqual(span1.subtype, subtype)
      t.strictEqual(span1.action, action)
    } {
      const type = 'db'
      const subtype = 'elasticsearch'
      const action = 'request'
      span2 = findObjInArray(data.spans, 'subtype', subtype)
      t.ok(span2, 'should have span with subtype ' + subtype)
      t.strictEqual(span2.type, type)
      t.strictEqual(span2.subtype, subtype)
      t.strictEqual(span2.action, action)
    }

    t.strictEqual(span1.name, method + ' ' + host)
    t.strictEqual(span2.name, 'Elasticsearch: ' + method + ' ' + path)

    t.ok(span2.stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    if (pathIsAQuery.test(path)) {
      t.deepEqual(span2.context.db, { statement: query, type: 'elasticsearch' })
    } else {
      t.notOk(span2.context.db, 'span2 should not have "context.db"')
    }

    const [address, port] = host.split(':')
    t.deepEqual(span2.context.destination, {
      service: {
        name: 'elasticsearch', resource: 'elasticsearch', type: 'db'
      },
      port: Number(port),
      address
    })

    t.ok(span1.timestamp > span2.timestamp, 'http span should start after elasticsearch span')
    if (abort) {
      t.ok(span1.timestamp + span1.duration * 1000 > span2.timestamp + span2.duration * 1000, 'http span should end after elasticsearch span when req is aborted')
    } else {
      t.ok(span1.timestamp + span1.duration * 1000 < span2.timestamp + span2.duration * 1000, 'http span should end before elasticsearch span')
    }

    t.end()
  }
}

function resetAgent (expected, cb) {
  if (typeof expected === 'function') {
    cb = expected
    expected = 3
  }
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
