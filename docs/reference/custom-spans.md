---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-spans.html
---

# Custom spans [custom-spans]

This is an example of how to use custom spans. For general information about the Elastic APM Node.js Span API, see the [Span API documentation](/reference/span-api.md).

If you want to track and time a custom event that happens in your application during a transaction, you can add a new span to an existing transaction.

In the example below, we create an Express app that times how long it takes to:

1. Receive the body of an HTTP POST or PUT request
2. Parse JSON sent by the client

```js
var apm = require('elastic-apm-node').start()
var app = require('express')()

// body reader middleware
app.use(function (req, res, next) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return next()
  }

  // `startSpan` will only return a span if there's an
  // active transaction
  var span = apm.startSpan('receiving body')

  var buffers = []
  req.on('data', function (chunk) {
    buffers.push(chunk)
  })
  req.on('end', function () {
    req.body = Buffer.concat(buffers).toString()

    // end the span after we're done loading data from the
    // client
    if (span) span.end()

    next()
  })
})

// JSON parser middleware
app.use(function (req, res, next) {
  if (req.headers['content-type'] !== 'application/json') {
    return next()
  }

  // start a span to measure the time it takes to parse
  // the JSON
  var span = apm.startSpan('parse json')

  try {
    req.json = JSON.parse(req.body)
  } catch (e) {}

  // when we've processed the json, stop the custom span
  if (span) span.end()

  next()
})

// ...your route handler goes here...

app.listen(3000)
```

