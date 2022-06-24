/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

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
  apmServerVersion: '8.0.0',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  spanCompressionEnabled: false
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
    t.error(err, 'no error from client.ping')
    agent.endTransaction()
    agent.flush()
  })
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
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
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
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
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
})

test('client.search with abort', function userLandCode (t) {
  resetAgent(done(t, 'POST', '/_search', 'q=pants'))

  agent.startTransaction('foo')

  var client = new elasticsearch.Client({ host: host })
  var query = { q: 'pants' }

  var req = client.search(query)
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')

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
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
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

    var statement = body.map(JSON.stringify).join('\n') + '\n'

    resetAgent(done(t, 'POST', '/_msearch', statement))

    agent.startTransaction('foo')

    var client = new elasticsearch.Client({ host: host })

    client.msearch({ body }, function (err) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
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

    var statement = body.map(JSON.stringify).join('\n') + '\n'

    resetAgent(done(t, 'POST', '/_msearch/template', statement))

    agent.startTransaction('foo')

    var client = new elasticsearch.Client({ host: host })

    client.msearchTemplate({ body }, function (err) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
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
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
})

test('client with host=<array of host:port>', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))
  agent.startTransaction('foo')
  var client = new elasticsearch.Client({ host: [host] })
  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
})

test('client with hosts=<array of host:port>', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))
  agent.startTransaction('foo')
  var client = new elasticsearch.Client({ hosts: [host, host] })
  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
})

test('client with hosts="http://host:port"', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))
  agent.startTransaction('foo')
  let hostWithProto = host
  if (!hostWithProto.startsWith('http')) {
    hostWithProto = 'http://' + host
  }
  var client = new elasticsearch.Client({ hosts: hostWithProto })
  client.ping(function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
  t.ok(agent.currentSpan === null, 'no currentSpan in sync code after elasticsearch client command')
})

function done (t, method, path, query) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1, 'should have 1 transaction')
    t.strictEqual(data.spans.length, 1, 'should have 1 span')

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo', 'transaction name should be "foo"')
    t.strictEqual(trans.type, 'custom', 'transaction type should be "custom"')

    const type = 'db'
    const subtype = 'elasticsearch'
    const action = 'request'
    const span = findObjInArray(data.spans, 'subtype', subtype)
    t.ok(span, 'should have span with subtype ' + subtype)
    t.strictEqual(span.type, type)
    t.strictEqual(span.subtype, subtype)
    t.strictEqual(span.action, action)

    t.strictEqual(span.name, 'Elasticsearch: ' + method + ' ' + path)

    t.ok(span.stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    if (pathIsAQuery.test(path)) {
      t.deepEqual(span.context.db, { statement: query, type: 'elasticsearch' })
    } else {
      t.notOk(span.context.db, 'span should not have "context.db"')
    }

    const [address, port] = host.split(':')
    t.deepEqual(span.context.destination, {
      service: {
        name: 'elasticsearch', resource: 'elasticsearch', type: 'db'
      },
      port: Number(port),
      address
    })

    t.end()
  }
}

function resetAgent (expected, cb) {
  if (typeof expected === 'function') {
    cb = expected
    expected = 2
  }
  agent._instrumentation.testReset()
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
