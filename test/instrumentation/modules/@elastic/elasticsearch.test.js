'use strict'

process.env.ELASTIC_APM_TEST = true
const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanFramesMinDuration: -1 // always capture stack traces with spans
})

const { safeGetPackageVersion } = require('../../../_utils')

// Skip (exit the process) if this package version doesn't support this version
// of node.
const esVersion = safeGetPackageVersion('@elastic/elasticsearch')
const semver = require('semver')
if (semver.lt(process.version, '10.0.0') && semver.gte(esVersion, '7.12.0')) {
  console.log(`# SKIP @elastic/elasticsearch@${esVersion} does not support node ${process.version}`)
  process.exit()
} else if (semver.lt(process.version, '12.0.0') && semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
  console.log(`# SKIP @elastic/elasticsearch@${esVersion} does not support node ${process.version}`)
  process.exit()
}

// Silence deprecation warning from @elastic/elasticsearch when using a Node.js
// version that is *soon* to be EOL'd, but isn't yet.
process.noDeprecation = true
const es = require('@elastic/elasticsearch')

const { Readable } = require('stream')
const test = require('tape')

const findObjInArray = require('../../../_utils').findObjInArray
const mockClient = require('../../../_mock_http_client')
const shimmer = require('../../../../lib/instrumentation/shimmer')
const { MockES } = require('./_mock_es')

const host = (process.env.ES_HOST || 'localhost') + ':9200'
const clientOpts = {
  node: 'http://' + host
}
// Limitation: For v8 of the ES client, these tests assume the non-default
// `HttpConnection` is used rather than the default usage of undici, because
// the tests check for an HTTP span for each ES request and currently the
// undici HTTP client is not instrumented.
if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
  clientOpts.Connection = es.HttpConnection
}

test('client.ping with promise', function (t) {
  resetAgent(checkDataAndEnd(t, 'HEAD', '/', null))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.ping().then(function () {
    agent.endTransaction()
    agent.flush()
  }).catch(t.error)
})

// Callback-style was dropped in ES client v8.
if (!semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
  test('client.ping with callback', function (t) {
    resetAgent(checkDataAndEnd(t, 'HEAD', '/', null))

    agent.startTransaction('myTrans')

    const client = new es.Client(clientOpts)
    client.ping(function (err, _result) {
      t.error(err)
      agent.endTransaction()
      agent.flush()
    })
  })
}

test('client.search with promise', function (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client
    .search(searchOpts)
    .then(function () {
      agent.endTransaction()
      agent.flush()
    })
    .catch(t.error)
})

test('client.child', function (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  const child = client.child({
    headers: { 'x-foo': 'bar' }
  })
  child.search(searchOpts)
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('client.search with queryparam', function (t) {
  const searchOpts = { q: 'pants' }

  resetAgent(checkDataAndEnd(t, 'GET', '/_search', 'q=pants'))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.search(searchOpts)
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('client.search with body', function (t) {
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

  const client = new es.Client(clientOpts)
  client.search(searchOpts)
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

// ES client version 8 no longer requires body fields to be in a "body" param.
if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
  test('client.search with query as top-level param (v8)', function (t) {
    const searchOpts = {
      index: 'myIndex*',
      query: {
        match: {
          request: 'bar'
        }
      }
    }

    let expectedDbStatement = Object.assign({}, searchOpts)
    delete expectedDbStatement.index
    expectedDbStatement = JSON.stringify(expectedDbStatement)
    resetAgent(checkDataAndEnd(t, 'POST', `/${searchOpts.index}/_search`, expectedDbStatement))

    agent.startTransaction('myTrans')

    const client = new es.Client(clientOpts)
    client.search(searchOpts)
      .catch((err) => { t.error(err) })
      .finally(() => {
        agent.endTransaction()
        agent.flush()
      })
  })
}

// Test `span.context.db.statement` format when the client request includes
// both a body *and* queryparam.
test('client.search with body & queryparams', function (t) {
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
  let statement
  // ES client version 8 merges options for *most* APIs into a single body
  // object, instead of separate query params and body.
  if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
    statement = '{"query":{"match":{"request":"bar"}},"size":2,"sort":"myField:asc"}'
  } else {
    statement = `size=2&sort=myField%3Aasc

${JSON.stringify(body)}`
  }

  resetAgent(checkDataAndEnd(t, 'POST', `/${searchOpts.index}/_search`, statement))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.search(searchOpts)
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('client.searchTemplate', function (t) {
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

  const client = new es.Client(clientOpts)
  client.searchTemplate({ body })
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('client.msearch', function (t) {
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
  let statement
  if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
    // This is pending on https://github.com/elastic/apm-agent-nodejs/issues/2388.
    statement = 'search_type=query_then_fetch&typed_keys=false'
  } else {
    statement = `search_type=query_then_fetch&typed_keys=false

${body.map(JSON.stringify).join('\n')}
`
  }

  resetAgent(checkDataAndEnd(t, 'POST', '/_msearch', statement))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.msearch(searchOpts)
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('client.msearchTempate', function (t) {
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
  let statement
  if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
    // This is pending on https://github.com/elastic/apm-agent-nodejs/issues/2388.
    statement = ''
  } else {
    statement = body.map(JSON.stringify).join('\n') + '\n'
  }

  resetAgent(checkDataAndEnd(t, 'POST', '/_msearch/template', statement))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.msearchTemplate({ body })
    .catch((err) => { t.error(err) })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

// Test some error scenarios.

// 'ResponseError' is the client's way of passing back an Elasticsearch API
// error. Some interesting parts of that error response body should be
// included in `err.context.custom`.
test('ResponseError', function (t) {
  resetAgent(
    function done (data) {
      const err = data.errors[0]
      t.ok(err, 'sent an error to APM server')
      t.ok(err.id, 'err.id')
      t.ok(err.exception.message, 'err.exception.message')
      t.equal(err.exception.type, 'ResponseError',
        'err.exception.type is ResponseError')
      if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
        t.equal(err.exception.module, '@elastic/transport')
        t.deepEqual(err.context.custom, {
          type: 'number_format_exception',
          reason: 'For input string: "surprise_me"',
          status: 400
        })
      } else {
        t.equal(err.exception.module, '@elastic/elasticsearch')
        t.deepEqual(err.context.custom, {
          type: 'illegal_argument_exception',
          reason: 'Failed to parse int parameter [size] with value [surprise_me]',
          caused_by: {
            type: 'number_format_exception',
            reason: 'For input string: "surprise_me"'
          },
          status: 400
        })
      }
      t.end()
    }
  )

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)

  client.search({ size: 'surprise_me', q: 'pants' })
    .then(() => {
      t.fail('should not have gotten here, should have errored instead')
    })
    .catch((err) => {
      t.ok(err, 'got an error from search callback')
      t.equal(err.name, 'ResponseError', 'error name is "ResponseError"')
    })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

if (semver.satisfies(esVersion, '<8', { includePrerelease: true })) {
  // Ensure that `captureError` serialization does *not* include the possibly
  // large `data` field from a deserialization error.
  //
  // Cannot simulate this with ES client version 8, because the
  // `client.transport`'s serializer is hidden behind a Symbol.
  test('DeserializationError', function (t) {
    resetAgent(
      function done (data) {
        const err = data.errors[0]
        t.ok(err, 'sent an error to APM server')
        t.ok(err.id, 'err.id')
        t.ok(err.exception.message, 'err.exception.message')
        t.equal(err.exception.type, 'DeserializationError',
          'err.exception.type is DeserializationError')
        t.notOk(err.exception.attributes && err.exception.attributes.data,
          'captured error should NOT include "data" attribute')
        t.end()
      }
    )

    agent.startTransaction('myTrans')

    const client = new es.Client(clientOpts)

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
}

if (semver.gte(esVersion, '7.14.0')) {
  test('ProductNotSupportedError', function (t) {
    // Create a mock Elasticsearch server that yields a "GET /" response
    // that triggers ProductNotSupportedError.
    const esServer = new MockES({
      responses: [
        {
          statusCode: 200,
          headers: {
            // This header value triggers ProductNotSupportedError for ES client v8+.
            'X-elastic-product': 'not-Elasticsearch',
            'content-type': 'application/json'
          },
          // This body triggers ProductNotSupportedError for ES client 7.x.
          body: JSON.stringify({ hi: 'there' })
        }
      ]
    })
    esServer.start(function (esUrl) {
      resetAgent(
        function done (data) {
          const err = data.errors[0]
          t.ok(err, 'sent an error to APM server')
          t.ok(err.id, 'err.id')
          t.ok(err.exception.message, 'got err.exception.message: ' + err.exception.message)
          t.equal(err.exception.type, 'ProductNotSupportedError',
            'err.exception.type is ProductNotSupportedError')
          t.end()
        }
      )

      agent.startTransaction('myTrans')
      const client = new es.Client(Object.assign(
        {},
        clientOpts,
        { node: esUrl }
      ))
      client.search({ q: 'pants' })
        .then(() => {
          t.fail('should not have gotten here, should have errored instead')
        })
        .catch((err) => {
          t.ok(err, 'got an error from search callback')
          t.equal(err.name, 'ProductNotSupportedError', 'error name is "ProductNotSupportedError"')
        })
        .finally(() => {
          agent.endTransaction()
          agent.flush()
          client.close()
          esServer.close()
        })
    })
  })
}

if (semver.gte(esVersion, '7.7.0') && semver.satisfies(esVersion, '7')) {
  // Abort handling was added to @elastic/elasticsearch@7.7.0 for the 7.x series.

  test('request.abort() works', function (t) {
    resetAgent(
      function done (data) {
        // We expect to get:
        // - 1 elasticsearch span
        // - 1 abort error (and possibly another error due to the double-callback
        //   bug mentioned below)
        const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
        t.ok(esSpan, 'have an elasticsearch span')

        const err = data.errors
          .filter((e) => e.exception.type === 'RequestAbortedError')[0]
        if (semver.satisfies(esVersion, '7.14.x')) {
          // https://github.com/elastic/elasticsearch-js/issues/1517 was fixed
          // for 7.15 and later.
          t.ok(!err, 'no APM error reported for abort with v7.14.x of the client because elastic/elasticsearch-js#1517')
        } else {
          t.ok(err, 'sent an error to APM server')
          t.ok(err.id, 'err.id')
          t.equal(err.exception.message, 'Request aborted', 'err.exception.message')
          t.equal(err.exception.type, 'RequestAbortedError',
            'err.exception.type is RequestAbortedError')
        }

        t.end()
      }
    )

    agent.startTransaction('myTrans')

    // Start a request that we expect to *not* succeed quickly (artificially
    // make getting the request body slow via `slowBody`) then abort as soon
    // as possible.
    const slowBody = new Readable({
      read (size) {
        setTimeout(() => {
          this.push('{"query":{"match_all":{}}}')
          this.push(null) // EOF
        }, 1000).unref()
      }
    })
    let gotCallbackAlready = false
    const client = new es.Client(clientOpts)
    const req = client.search({ body: slowBody }, function (err, _result) {
      // Use gotCallbackAlready to avoid double-callback bug
      // https://github.com/elastic/elasticsearch-js/issues/1374
      if (!gotCallbackAlready) {
        gotCallbackAlready = true
        t.ok(err, 'got error')
        t.equal(err.name, 'RequestAbortedError', 'error is RequestAbortedError')
        agent.endTransaction()
        agent.flush()
      }
    })
    setImmediate(function () {
      req.abort()
    })
  })

  test('promise.abort() works', function (t) {
    resetAgent(
      function done (data) {
        // We expect to get:
        // - 1 elasticsearch span
        // - 1 abort error (and possibly another error due to a double-callback
        //   bug https://github.com/elastic/elasticsearch-js/issues/1374)

        const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
        t.ok(esSpan, 'have an elasticsearch span')

        const err = data.errors
          .filter((e) => e.exception.type === 'RequestAbortedError')[0]
        if (semver.satisfies(esVersion, '7.14.x')) {
          // https://github.com/elastic/elasticsearch-js/issues/1517 was fixed
          // for 7.15 and later.
          t.ok(!err, 'no APM error reported for abort with v7.14.x of the client because elastic/elasticsearch-js#1517')
        } else {
          t.ok(err, 'sent an error to APM server')
          t.ok(err.id, 'err.id')
          t.ok(err.exception.message, 'err.exception.message')
          t.equal(err.exception.type, 'RequestAbortedError',
            'err.exception.type is RequestAbortedError')
        }

        t.end()
      }
    )

    agent.startTransaction('myTrans')

    // Start a request that we expect to *not* succeed quickly (artificially
    // make getting the request body slow via `slowBody`) then abort as soon
    // as possible.
    const slowBody = new Readable({
      read (size) {
        setTimeout(() => {
          this.push('{"query":{"match_all":{}}}')
          this.push(null) // EOF
        }, 1000).unref()
      }
    })
    const client = new es.Client(clientOpts)
    const promise = client.search({ body: slowBody })
    promise
      .then(_result => {})
      .catch(err => {
        t.ok(err, 'got error')
        t.equal(err.name, 'RequestAbortedError', 'error is RequestAbortedError')
        agent.endTransaction()
        agent.flush()
      })
    setImmediate(function () {
      promise.abort()
    })
  })
}

test('outcome=success on both spans', function (t) {
  resetAgent(checkSpanOutcomesSuccess(t))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.ping()
    .catch(t.error)
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

test('outcome=failure on both spans', function (t) {
  const searchOpts = { notaparam: 'notthere' }

  resetAgent(checkSpanOutcomesFailures(t))

  agent.startTransaction('myTrans')

  const client = new es.Client(clientOpts)
  client.search(searchOpts)
    .catch((err) => {
      t.ok(err, 'got an error from search with bogus "notaparam"')
    })
    .finally(() => {
      agent.endTransaction()
      agent.flush()
    })
})

// Utility functions.

function checkSpanOutcomesFailures (t) {
  return function (data) {
    data.spans.sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      // Remove leading ES span and HTTP span from product check.
      data.spans = data.spans.slice(2)
    }

    for (const span of data.spans) {
      t.equals(span.outcome, 'failure', 'spans outcomes are failure')
    }
    t.end()
  }
}

function checkSpanOutcomesSuccess (t) {
  return function (data) {
    data.spans.sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      // Remove leading ES span and HTTP span from product check.
      data.spans = data.spans.slice(2)
    }

    for (const span of data.spans) {
      t.equals(span.outcome, 'success', 'spans outcomes are success')
    }
    t.end()
  }
}

function checkDataAndEnd (t, method, path, dbStatement) {
  return function (data) {
    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    const trans = data.transactions[0]
    t.equal(trans.name, 'myTrans', 'should have expected transaction name')
    t.equal(trans.type, 'custom', 'should have expected transaction type')

    // As of @elastic/elasticsearch@7.14.0 and only for the 7.x series,
    // the first request from an ES Client will be preceded by a preflight
    // "GET /" product check.
    data.spans.sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      const prodCheckEsSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
      t.ok(prodCheckEsSpan, 'have >=7.14.0 product check ES span')
      t.equal(prodCheckEsSpan.name, 'Elasticsearch: GET /', 'product check ES span name')
      const prodCheckHttpSpan = findObjInArray(data.spans, 'subtype', 'http')
      t.ok(prodCheckHttpSpan, 'have >=7.14.0 product check HTTP span')
      t.equal(prodCheckHttpSpan.name, `GET ${host}`, 'product check HTTP span name')
      // Remove the product check spans for subsequent assertions.
      data.spans = data.spans.slice(2)
    }

    t.equal(data.spans.length, 2, 'should have 2 spans (excluding product check spans in >=7.14.0)')

    const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch')
    t.ok(esSpan, 'have an elasticsearch span')
    t.strictEqual(esSpan.type, 'db')
    t.strictEqual(esSpan.subtype, 'elasticsearch')
    t.strictEqual(esSpan.action, 'request')
    t.strictEqual(esSpan.sync, false, 'span.sync=false')

    const httpSpan = findObjInArray(data.spans, 'subtype', 'http')
    t.ok(httpSpan, 'have an http span')
    t.strictEqual(httpSpan.type, 'external')
    t.strictEqual(httpSpan.subtype, 'http')
    t.strictEqual(httpSpan.action, method)
    t.strictEqual(httpSpan.sync, false, 'span.sync=false')

    t.equal(httpSpan.name, method + ' ' + host, 'http span should have expected name')
    t.equal(esSpan.name, 'Elasticsearch: ' + method + ' ' + path, 'elasticsearch span should have expected name')

    // Iff the test case provided a `dbStatement`, then we expect `.context.db`.
    if (typeof dbStatement === 'string') {
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

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
}
