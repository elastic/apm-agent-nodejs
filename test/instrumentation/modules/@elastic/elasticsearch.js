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

const shimmer = require('../../../../lib/instrumentation/shimmer')
const test = require('tape')

const { Client } = require('@elastic/elasticsearch')

const mockClient = require('../../../_mock_http_client')
const findObjInArray = require('../../../_utils').findObjInArray

test('client.ping with promise', function userLandCode (t) {
  resetAgent(checkDataAndEnd(t, 'HEAD', '/', null))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.ping().then(function () {
    agent.endTransaction()
    agent.flush()
  }).catch(t.error)
})

test('client.ping with callback', function userLandCode (t) {
  resetAgent(checkDataAndEnd(t, 'HEAD', '/', null))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.ping(function (err, _result) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.search with promise', function userLandCode (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client
    .search(searchOpts)
    .then(function () {
      agent.endTransaction()
      agent.flush()
    })
    .catch(t.error)
})

test('client.child', function userLandCode (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  const child = client.child({
    headers: { 'x-foo': 'bar' }
  })
  child.search(searchOpts, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.search with queryparam', function userLandCode (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.search(searchOpts, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.search with body', function userLandCode (t) {
  const body = {
    query: {
      match: {
        request: 'bar'
      }
    }
  }
  const searchOpts = {
    index: 'myIndex*',
    body: body
  }

  resetAgent(checkDataAndEnd(t, 'POST', `/${searchOpts.index}/_search`, JSON.stringify(body)))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.search(searchOpts, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

// Test `span.context.db.statement` format when the client request includes
// both a body *and* queryparam.
test('client.search with body & queryparams', function userLandCode (t) {
  const body = {
    query: {
      match: {
        request: 'bar'
      }
    }
  }
  const searchOpts = {
    index: 'myIndex*',
    body: body,
    size: 2,
    sort: 'myField:asc'
  }
  const statement = `size=2&sort=myField%3Aasc

${JSON.stringify(body)}`

  resetAgent(checkDataAndEnd(t, 'POST', `/${searchOpts.index}/_search`, statement))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.search(searchOpts, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.searchTemplate', function userLandCode (t) {
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

  resetAgent(checkDataAndEnd(t, 'POST', '/_search/template', JSON.stringify(body)))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.searchTemplate({ body }, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.msearch', function userLandCode (t) {
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
  const searchOpts = {
    search_type: 'query_then_fetch',
    typed_keys: false,
    body: body
  }
  const statement = `search_type=query_then_fetch&typed_keys=false

${body.map(JSON.stringify).join('\n')}
`

  resetAgent(checkDataAndEnd(t, 'POST', '/_msearch', statement))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.msearch(searchOpts, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

test('client.msearchTempate', function userLandCode (t) {
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
  const statement = body.map(JSON.stringify).join('\n') + '\n'

  resetAgent(checkDataAndEnd(t, 'POST', '/_msearch/template', statement))

  agent.startTransaction('myTrans')

  const client = new Client({ node })
  client.msearchTemplate({ body }, function (err) {
    t.error(err)
    agent.endTransaction()
    agent.flush()
  })
})

// Test some error scenarios:
// - DeserializationError includes err.data which might be interesting to
//   ensure is sanitized.
// - TimeoutError is a convenient way to test retries.

test('DeserializationError', function (t) {
  resetAgent(
    function done (data) {
      const err = data.errors[0]
      t.ok(err, 'sent an error to APM server')
      t.ok(err.id, 'err.id')
      t.ok(err.exception.message, 'err.exception.message')
      t.equal(err.exception.type, 'DeserializationError',
        'err.exception.type is DeserializationError')
      t.end()
    }
  )

  agent.startTransaction('myTrans')

  const client = new Client({ node })

  // To simulate an error we monkey patch the client's Serializer such that
  // deserialization of the response body fails.
  shimmer.wrap(client.transport.serializer, 'deserialize', function wrapDeserialize (origDeserialize) {
    return function wrappedDeserialize (json) {
      return origDeserialize.call(this, json + 'THIS_WILL_BREAK_JSON_DESERIALIZATION')
    }
  })

  client.search({ q: 'pants' }, function (err, _result) {
    t.ok(err, 'got an error from search callback')
    t.equal(err.name, 'DeserializationError', 'error name is "DeserializationError"')
    agent.endTransaction()
    agent.flush()
  })
})

test('TimeoutError without retries', function (t) {
  resetAgent(
    function done (data) {
      const err = data.errors[0]
      t.ok(err, 'sent an error to APM server')
      t.ok(err.id, 'err.id')
      t.ok(err.exception.message, 'err.exception.message')
      t.equal(err.exception.type, 'TimeoutError',
        'err.exception.type is TimeoutError')
      t.end()
    }
  )

  agent.startTransaction('myTrans')

  // (Hopefully) force a timeout error with a short 1ms timeout.
  const client = new Client({ node, requestTimeout: 1, maxRetries: 0 })
  client.search({ q: 'pants' }, function (err, _result) {
    t.ok(err, 'got an error from search callback')
    t.equal(err.name, 'TimeoutError', 'error name is "TimeoutError"')
    agent.endTransaction()
    agent.flush()
  })
})

test('TimeoutError with 2 retries', function (t) {
  resetAgent(
    function done(data) {
      // We expect to get:
      // - 1 elasticsearch span
      // - 3 HTTP spans
      // - 1 timeout error

      const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
      t.ok(esSpan, 'have an elasticsearch span')

      const httpSpans = data.spans.filter(s => s.subtype === 'http')
      t.equal(httpSpans.length, 3, 'have 3 http spans')
      httpSpans.forEach(httpSpan => {
        t.ok(httpSpan.timestamp > esSpan.timestamp,
          `http span should start, ${httpSpan.timestamp}, after elasticsearch span, ${esSpan.timestamp}`)
        // On timeout the Transport returns to retry-handling immediately
        // while the timed out HTTP request is aborted asynchronously. That
        // means the HTTP spans could end *after* the Elasticsearch span.
      })

      const err = data.errors[0];
      t.ok(err, 'sent an error to APM server')
      t.ok(err.id, 'err.id')
      t.ok(err.exception.message, 'err.exception.message')
      t.equal(err.exception.type, 'TimeoutError',
        'err.exception.type is TimeoutError')

      t.end();
    }
  )

  agent.startTransaction('myTrans')

  // (Hopefully) force a timeout error with a short 1ms timeout.
  const client = new Client({ node, requestTimeout: 1, maxRetries: 2 })
  client.search({q: 'pants'}, function (err, _result) {
    t.ok(err, 'got an error from search callback')
    t.equal(err.name, 'TimeoutError', 'error name is "TimeoutError"')
    agent.endTransaction()
    agent.flush()
  })
})

// Utility functions.

function checkDataAndEnd (t, method, path, dbStatement) {
  return function (data) {
    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    t.equal(data.spans.length, 2, 'should have 2 spans')

    const trans = data.transactions[0]
    t.equal(trans.name, 'myTrans', 'should have expected transaction name')
    t.equal(trans.type, 'custom', 'should have expected transaction type')

    const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
    t.ok(esSpan, 'have an elasticsearch span')
    t.strictEqual(esSpan.type, 'db')
    t.strictEqual(esSpan.subtype, 'elasticsearch')
    t.strictEqual(esSpan.action, 'request')

    const httpSpan = findObjInArray(data.spans, 'subtype', 'http')
    t.ok(httpSpan, 'have an http span')
    t.strictEqual(httpSpan.type, 'external')
    t.strictEqual(httpSpan.subtype, 'http')
    t.strictEqual(httpSpan.action, 'http')

    t.equal(httpSpan.name, method + ' ' + host + path, 'http span should have expected name')
    t.equal(esSpan.name, 'Elasticsearch: ' + method + ' ' + path, 'elasticsearch span should have expected name')

    t.ok(esSpan.stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'esSpan.stacktrace includes "userLandCode" frame')

    // Iff the test case provided a `dbStatement`, then we expect `.context.db`.
    if (dbStatement) {
      t.deepEqual(esSpan.context.db,
        { type: 'elasticsearch', statement: dbStatement },
        'elasticsearch span has correct .context.db')
    } else {
      t.notOk(esSpan.context.db, 'elasticsearch span should not have .context.db')
    }

    // Ensure "destination" context is set.
    t.equal(esSpan.context.destination.service.name, 'elasticsearch',
      'elasticsearch span.context.destination.service.name=="elasticsearch"')

    t.ok(httpSpan.timestamp > esSpan.timestamp,
      'http span should start after elasticsearch span')
    t.ok(httpSpan.timestamp + httpSpan.duration * 1000 < esSpan.timestamp + esSpan.duration * 1000,
      'http span should end before elasticsearch span')

    // TODO test that httpSpan is child of esSpan? currently it isn't
    // XXX test retries
    // XXX test error capture

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
}
