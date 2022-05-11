'use strict'

// This tests the OTel Bridge for the case when `transactionMaxSpans` is hit.
//
// This results in `<Transaction>.createSpan(...)` returning null. The OTel
// Bridge needs to cope by returning a non-recording span. It *also* needs
// to propagate W3C trace-context for outgoing HTTP requests.
//
// Usage:
//    ELASTIC_APM_TRANSACTION_MAX_SPANS=3 \
//      ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true \
//      node -r ../../../start.js hit-transaction-max-spans.js
//
// Expected trace:
//   trace $traceId
//   `- transaction $myTransId "myTrans"
//     `- span "s0"
//       `- span "GET localhost:$port" (http)
//         `- transaction "GET unknown route"
//     `- span "s1"                           // This is the 3rd (max) span.
//       `- transaction "GET unknown route"
//     `- transaction "GET unknown route"
//     `- transaction "GET unknown route"
//     `- transaction "GET unknown route"

const http = require('http')

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('test-hit-transaction-max-spans')

const server = http.createServer(function onRequest (req, res) {
  console.log('server request: %s %s %s', req.method, req.url, req.headers)
  req.resume()
  req.on('end', function () {
    const resBody = JSON.stringify({ ping: 'pong' })
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(resBody)
    })
    res.end(resBody)
  })
})

async function makeAClientRequest (i, port) {
  console.log('\n-- make client request %d', i)
  await tracer.startActiveSpan(`s${i}`, async (s) => {
    return new Promise(resolve => {
      http.get({
        host: 'localhost',
        port: port,
        path: `/ping-${i}`
      }, (cRes) => {
        console.log('client response status:', cRes.statusCode)
        console.log('client response headers:', cRes.headers)
        const body = []
        cRes.on('data', (chunk) => body.push(chunk))
        cRes.on('end', () => {
          console.log('client response body:', body.toString())
          s.end()
          resolve()
        })
      })
    })
  })
}

server.listen(async () => {
  const port = server.address().port
  tracer.startActiveSpan('myTrans', async (myTrans) => {
    // Make 5 client requests to `server` in sequence. Each of those requests
    // involves two spans (a manual `s${i}` span and the auto-instrumented
    // http.get() span). We expect to hit the `transactionMaxSpans` limit.
    for (let i = 0; i < 5; i++) {
      await makeAClientRequest(i, port)
    }
    myTrans.end()
    server.close()
  })
})
