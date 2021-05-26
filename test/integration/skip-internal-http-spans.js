'use strict'

const { Transform } = require('stream')
const getPort = require('get-port')

const agent = require('../../')

getPort().then(port => {
  agent.start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    logLevel: 'trace'
  })

  // XXX
  // Client.prototype._encode = function (obj, enc) {
  agent._transport._origEncode = agent._transport._encode
  agent._transport._encode = function (obj, enc) {
    let encoded = this._origEncode(obj, enc)
    console.warn('XXX encoded: %s', encoded)
    if (encoded.startsWith('{"span"')) {
      encoded = '{"walla":"walla","span":{"name":"SPAN","type":"custom","id":"123fbe88aade951d","transaction_id":"123fbe88aade951d","parent_id":"123fbe88aade951d","trace_id":"690916c68c76b27b15922a9730d06644","subtype":null,"action":null,"timestamp":1622067538909570,"duration":2.857,"stacktrace":[{"filename":"lib/instrumentation/transaction.js","lineno":6,"function":"Transaction.startSpan","library_frame":false,"abs_path":"/app/lib/instrumentation/transaction.js"},{"filename":"lib/instrumentation/index.js","lineno":11,"function":"Instrumentation.startSpan","library_frame":false,"abs_path":"/app/lib/instrumentation/index.js"},{"filename":"lib/agent.js","lineno":16,"function":"Agent.startSpan","library_frame":false,"abs_path":"/app/lib/agent.js"},{"filename":"test/integration/skip-internal-http-spans.js","lineno":81,"function":"Server.<anonymous>","library_frame":false,"abs_path":"/app/test/integration/skip-internal-http-spans.js"},{"filename":"node:events","lineno":433,"function":"onceWrapper","library_frame":true,"abs_path":"node:events"},{"filename":"node:events","lineno":327,"function":"emit","library_frame":true,"abs_path":"node:events"},{"filename":"lib/instrumentation/http-shared.js","lineno":5,"function":"Server.emit","library_frame":false,"abs_path":"/app/lib/instrumentation/http-shared.js"},{"filename":"node:net","lineno":1320,"function":"emitListeningNT","library_frame":true,"abs_path":"node:net"},{"filename":"lib/instrumentation/index.js","lineno":40,"function":"elasticAPMCallbackWrapper","library_frame":false,"abs_path":"/app/lib/instrumentation/index.js"},{"filename":"node:internal/process/task_queues","lineno":79,"function":"processTicksAndRejections","library_frame":true,"abs_path":"node:internal/process/task_queues"}],"sync":false,"outcome":"success","sample_rate":1}}'
    }
    return encoded
  }

  // hack to ensure that all incoming http requests picked up on the mock APM
  // Server doesn't generate any transactions that again will be sent to the
  // same APM Server
  agent.addTransactionFilter(payload => {
    return false
  })

  const http = require('http')
  const zlib = require('zlib')
  const ndjson = require('ndjson')
  const test = require('tape')

  test('should not throw on socket close', t => {
    const seen = {
      metadata: 0,
      transaction: 0,
      span: 0,
      error: 0
    }

    const expected = {
      metadata: 1,
      transaction: 0,
      span: 1,
      error: 0
    }

    const server = http.createServer((req, res) => {
      req
        .pipe(new Transform({
          transform (chunk, encoding, callback) {
            console.warn('XXX raw chunk (base64):', chunk.toString('base64'))
            this.push(chunk)
            callback()
          }
        }))
        .pipe(zlib.createGunzip())
        .pipe(new Transform({
          transform (chunk, encoding, callback) {
            console.warn('XXX gunzipped+toStringed chunk:', chunk.toString())
            this.push(chunk)
            callback()
          }
        }))
        .pipe(ndjson.parse())
        .on('data', data => {
          const key = Object.keys(data)[0]
          seen[key] = (seen[key] || 0) + 1
        })
        .on('end', () => res.end())
    })

    server.listen(port, () => {
      agent.startTransaction('transaction')
      agent.startSpan('span').end()

      // wait for span to be processed
      setTimeout(() => {
        // flush agent to generate outgoing http request to the APM Server
        agent.flush(() => {
          // wait for potential span related to the outgoing http request to be processed
          setTimeout(() => {
            for (const key of Object.keys(expected)) {
              t.strictEqual(seen[key], expected[key], `has expected value for ${key}`)
            }

            // flush agent again to see if it created a span for the first flush
            agent.flush(() => {
              // give the APM Server time to receive an process the 2nd flush
              setTimeout(() => {
                for (const key of Object.keys(expected)) {
                  t.strictEqual(seen[key], expected[key], `has expected value for ${key}`)
                }

                server.close()
                t.end()
              }, 100)
            })
          }, 100)
        })
      }, 100)
    })
  })
})
