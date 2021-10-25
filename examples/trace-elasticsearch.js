#!/usr/bin/env node --unhandled-rejections=strict

// A small example showing Elastic APM tracing @elastic/elasticsearch.
//
// This assumes an Elasticsearch running on localhost. You can use:
//    npm run docker:start
// to start an Elasticsearch docker container (and other containers used for
// testing of this project). Then `npm run docker:stop` to stop them.

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-elasticsearch'
})

const { Client } = require('@elastic/elasticsearch')

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
  .then((res) => { console.log('ping response:', res) })
  .catch((err) => { console.log('ping error:', err) })
  .finally(() => { apm.endTransaction() })

// Example using async/await style.
async function awaitStyle () {
  apm.startTransaction('t2')
  try {
    const res = await client.search({ q: 'pants' })
    console.log('search response:', res)
  } catch (err) {
    console.log('search error:', err)
  } finally {
    apm.endTransaction()
  }
}
awaitStyle()

// TODO: pending completion of AbortController work in ES client v8.
// // Example aborting requests using AbortController.
// async function abortExample () {
//   apm.startTransaction('t3')
//   const abortController = new AbortController()
//   setImmediate(() => {
//     abortController.abort()
//   })
//   try {
//     const res = await client.search(
//       { query: { match_all: {} } },
//       { abortController })
//     console.log('search response:', res)
//   } catch (err) {
//     console.log('search error:', err)
//   } finally {
//     apm.endTransaction()
//   }
// }
// if (global.AbortController) {
//   abortExample()
// }
