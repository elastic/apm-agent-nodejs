'use strict'

process.env.ELASTIC_APM_TEST = true
const host = (process.env.ES_HOST || 'localhost') + ':9200'
const node = 'http://' + host

const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const test = require('tape')

const { Client } = require('@elastic/elasticsearch')

const mockClient = require('../../../_mock_http_client')
const findObjInArray = require('../../../_utils').findObjInArray

test('client.ping with promise', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo')

  const client = new Client({ node })

  client.ping().then(function () {
    agent.endTransaction()
    agent.flush()
  }).catch(t.error)
})

test('client.ping with callback', function userLandCode (t) {
  resetAgent(done(t, 'HEAD', '/'))

  agent.startTransaction('foo')

  const client = new Client({ node })

  client.ping(function (err, result) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.search with callback', function userLandCode (t) {
  resetAgent(done(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('foo')

  const client = new Client({ node })
  const query = { q: 'pants' }

  client.search(query, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.searchTemplate with callback', function userLandCode (t) {
  const body = {
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

  const client = new Client({ node })

  client.searchTemplate({ body }, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.msearch with callback', function userLandCode (t) {
  const body = [
    {},
    {
      query: {
        query_string: {
          query: 'pants'
        }
      }
    }
  ]

  const statement = body.map(JSON.stringify).join('\n')

  resetAgent(done(t, 'POST', '/_msearch', statement))

  agent.startTransaction('foo')

  const client = new Client({ node })

  client.msearch({ body }, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.msearchTempate with callback', function userLandCode (t) {
  const body = [
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

  const statement = body.map(JSON.stringify).join('\n')

  resetAgent(done(t, 'POST', '/_msearch/template', statement))

  agent.startTransaction('foo')

  const client = new Client({ node })

  client.msearchTemplate({ body }, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

const queryRegexp = /_((search|msearch)(\/template)?|count)$/
function done (t, method, path, query) {
  return function (data) {
    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    t.equal(data.spans.length, 2, 'should have 2 spans')

    const trans = data.transactions[0]

    t.equal(trans.name, 'foo', 'should have expected transaction name')
    t.equal(trans.type, 'custom', 'should have expected transaction type')

    let span1, span2
    {
      const type = 'ext.http.http'
      span1 = findObjInArray(data.spans, 'type', type)
      t.ok(span1, 'should have span with type ' + type)
    } {
      const type = 'db.elasticsearch.request'
      span2 = findObjInArray(data.spans, 'type', type)
      t.ok(span2, 'should have span with type ' + type)
    }

    t.equal(span1.name, method + ' ' + host + path, 'http span should have expected name')
    t.equal(span2.name, 'Elasticsearch: ' + method + ' ' + path, 'elasticsearch span should have expected name')

    t.ok(span2.stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    if (queryRegexp.test(path)) {
      t.deepEqual(span2.context.db, { type: 'elasticsearch', statement: query || '{}' }, 'elasticsearch span should have db context')
    } else {
      t.notOk(span2.context, 'elasticsearch span should not have custom context')
    }

    t.ok(span1.timestamp > span2.timestamp, 'http span should start after elasticsearch span')
    t.ok(span1.timestamp + span1.duration * 1000 < span2.timestamp + span2.duration * 1000, 'http span should end before elasticsearch span')

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
