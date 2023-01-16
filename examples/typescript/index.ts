/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Be sure to import and *start* the agent before other imports.
import 'elastic-apm-node/start'

import http from 'http'

// Create an HTTP server listening at port 3000.
const server = http.createServer((req, res) => {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers)
  req.resume()
  req.on('end', function () {
    const resBody = 'pong'
    res.writeHead(200, {
      server: 'example-trace-http',
      'content-type': 'text/plain',
      'content-length': Buffer.byteLength(resBody)
    })
    res.end(resBody)
  })
})
server.listen(3000, function () {

  // Make a single HTTP request, then stop the server.
  const clientReq = http.request('http://localhost:3000/ping', clientRes => {
    console.log('client response: %s %s', clientRes.statusCode, clientRes.headers)
    const chunks: Array<string> = []
    clientRes.on('data', function (chunk) {
      chunks.push(chunk)
    })
    clientRes.on('end', function () {
      const body = chunks.join('')
      console.log('client response body: %j', body)
      server.close()
    })
  })
  clientReq.end()

})
