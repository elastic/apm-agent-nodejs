// vim: set ts=2 sw=2:

const apm = require('./').start({
  serviceName: 'trentm-esapp',
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureBody: 'all',
  captureSpanStackTraces: false,
  apiRequestTime: '3s',
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  useElasticTraceparentHeader: false,
  logLevel: 'trace'
})

const http = require('http')
const express = require('express')

const { Client } = require('@elastic/elasticsearch')
var esclient = new Client({
  node: 'http://localhost:9200',
  auth: { username: 'admin', password: 'changeme' }
})

// Warn on "slow" ES queries, include execution context.
const WHAT_IS_SLOW = 10 // ms
esclient.on('request', function (_err, event) {
  const { meta } = event
  if (!meta.context) {
    meta.context = {}
  }
  meta.context.startTime = Date.now()
})
esclient.on('response', function (_err, event) {
  const latency = Date.now() - event.meta.context.startTime
  if (latency > WHAT_IS_SLOW) {
    console.warn(`ZOMG this ES query was SLOW:\n  latency: ${latency}ms\n  kibanaExecutionContext: ${apm.getBaggageEntry('kibanaExecutionContext')}`, )
  }
})

// Add `x-opaque-id: <execution context>` header to ES requests.
esclient.on('request', function (_err, event) {
  const ec = apm.getBaggageEntry('kibanaExecutionContext')
  if (ec) {
    event.meta.request.params.headers['x-opaque-id'] = ec
  }
})

function setExecutionContext ({name, type, url, desc}) {
  const exectx = { name, type, url, desc }
  apm.setBaggageEntry('kibanaExecutionContext', JSON.stringify(exectx))
}

const app = express()
app.get('/', (req, res) => {
  setExecutionContext({
    name: 'doAQuery',
    type: 'someType',
    url: req.url
  })
  esclient.search({
    body: {
      size: 1,
      query: {
        match_all: {}
      }
    }
  }, (err, result) => {
    if (err) {
      res.send(err)
    } else {
      res.header('content-type', 'application/json')
      res.send(result.body.hits.hits)
    }
  })
})

app.listen(3000, function () {
  console.log('listening at http://localhost:3000')
})

// Make a req after startup to help with dev.
setTimeout(function sendAReq () {
  http.get('http://localhost:3000')
}, 1000)
