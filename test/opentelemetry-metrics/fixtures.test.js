/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Thes tests below execute a script from "fixtures/" something like:
//
//    ELASTIC_APM_METRICS_INTERVAL=500ms ELASTIC_APM_API_REQUEST_TIME=500ms \
//      node -r ../../start.js fixtures/start-span.js
//
// waits a short period to be sure metrics have been sent, stops the process,
// then asserts the mock APM server got the expected metrics data.
//
// The scripts can be run independent of the test suite.

const { execFile } = require('child_process')
const path = require('path')
const tape = require('tape')

const { MockAPMServer } = require('../_mock_apm_server')
const { findObjInArray } = require('../_utils')

const cases = [
  {
    script: 'otelapi-counter.js',
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object')
      const metricset = findObjInArray(events, 'metricset.samples.test_counter').metricset
      console.log('XXX metricset:'); console.dir(metricset, { depth: 5 })
      t.equal(metricset.samples.test_counter.type, 'counter', 'metricset.samples.test_counter.type')
      t.ok(Number.isInteger(metricset.samples.test_counter.value), 'metricset.samples.test_counter.value')
      // XXX desc?
      // XXX units?
      const agoUs = Date.now() * 1000 - metricset.timestamp
      const limit = 10 * 1000 * 1000 // 10s ago in μs
      t.ok(agoUs > 0 && agoUs < limit, `metricset.timestamp (a recent number of μs since the epoch, ${agoUs}μs ago)`)
    }
  }
]

cases.forEach(c => {
  tape.test(`test/opentelemetry-metrics/fixtures/${c.script}`, c.testOpts || {}, t => {
    const server = new MockAPMServer()
    const scriptPath = path.join('fixtures', c.script)
    server.start(function (serverUrl) {
      const proc = execFile(
        process.execPath,
        ['-r', '../../start.js', scriptPath],
        {
          cwd: __dirname,
          timeout: 10000, // guard on hang, 3s is sometimes too short for CI
          env: Object.assign(
            {},
            process.env,
            c.env,
            {
              ELASTIC_APM_SERVER_URL: serverUrl,
              ELASTIC_APM_METRICS_INTERVAL: '500ms',
              ELASTIC_APM_API_REQUEST_TIME: '500ms',
              ELASTIC_APM_CENTRAL_CONFIG: 'false',
              ELASTIC_APM_CLOUD_PROVIDER: 'none',
              ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS: 'true'
            }
          )
        },
        function done (err, _stdout, _stderr) {
          t.error(err, `${scriptPath} exited non-zero`)
          if (err) {
            t.comment('skip checks because script errored out')
          } else {
            c.check(t, server.events)
          }
          server.close()
          t.end()
        }
      )
      setTimeout(() => {
        proc.kill()
      }, 2000)
    })
  })
})
