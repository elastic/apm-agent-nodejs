#!/usr/bin/env node --unhandled-rejections=strict

// A small example showing Elastic APM tracing @elastic/elasticsearch version 8.
//
// This assumes an Elasticsearch running on localhost. You can use:
//    npm run docker:start
// to start an Elasticsearch docker container (and other containers used for
// testing of this project). Then `npm run docker:stop` to stop them.

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-elasticsearch'
})

// Currently, pre-releases of v8 are published as the "...-canary" package name.
const { Client } = require('@elastic/elasticsearch-canary')

const client = new Client({
  // With version 8 of the client, you can use `HttpConnection` to use the old
  // HTTP client:
  //   Connection: HttpConnection,
  node: `http://${process.env.ES_HOST || 'localhost'}:9200`
})

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
apm.startTransaction('t1')
client.ping()
  .then((res) => { console.log('[example 1] ping response:', res) })
  .catch((err) => { console.log('[example 1] ping error:', err) })
  .finally(() => { apm.endTransaction() })

// Example using async/await style.
async function awaitStyle () {
  apm.startTransaction('t2')
  try {
    const res = await client.search({ q: 'pants' })
    console.log('[example 2] search response:', res)
  } catch (err) {
    console.log('[example 2] search error:', err)
  } finally {
    apm.endTransaction()
  }
}
awaitStyle()

// Example aborting requests using AbortController.
async function abortExample () {
  apm.startTransaction('t3')
  const ac = new AbortController()
  setImmediate(() => {
    ac.abort()
  })
  try {
    const res = await client.search(
      { query: { match_all: {} } },
      { signal: ac.signal })
    console.log('[example 3] search response:', res)
  } catch (err) {
    console.log('[example 3] search error:', err)
  } finally {
    apm.endTransaction()
  }
}
if (global.AbortController) {
  abortExample()
}
