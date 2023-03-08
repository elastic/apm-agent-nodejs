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

const util = require('util')

const { execFile } = require('child_process')
const path = require('path')
const semver = require('semver')
const tape = require('tape')

const { MockAPMServer } = require('../_mock_apm_server')
const { findObjsInArray, formatForTComment } = require('../_utils')

if (!semver.satisfies(process.version, '>=14')) {
  console.log(`# SKIP @opentelemetry/sdk-metrics only supports node >=14 (node ${process.version})`)
  process.exit()
}

const undici = require('undici') // import after we've excluded node <14

async function checkEventsHaveTestMetrics (t, events) {
  const metricsets = findObjsInArray(events, 'metricset.samples.test_counter')
  t.comment('first metricset: ' + formatForTComment(util.inspect(metricsets[0].metricset)))
  // XXX desc?
  // XXX units?
  metricsets.forEach(event => {
    let m

    const agoUs = Date.now() * 1000 - event.metricset.timestamp
    const limit = 10 * 1000 * 1000 // 10s ago in μs
    t.ok(agoUs > 0 && agoUs < limit, `metricset.timestamp (a recent number of μs since the epoch, ${agoUs}μs ago)`)
    t.deepEqual(event.metricset.tags, {}, 'metricset.tags')

    m = event.metricset.samples.test_counter
    t.equal(m.type, 'counter', 'test_counter.type')
    t.ok(Number.isInteger(m.value) && m.value >= 0, 'test_counter.value is a positive integer')
    // The expected value is between 2 and 3 because we have
    // `metricsInterval=500ms` and the "fixtures/*.js" scripts are incrementing
    // the counters every 200ms.
    t.ok(2 <= m.value && m.value <= 3, // eslint-disable-line yoda
      'test_counter value is in [2,3] range, indicating aggregation temporality is the expected "Delta"')

    m = event.metricset.samples.test_async_counter
    t.equal(m.type, 'counter', 'test_async_counter.type')
    t.ok(2 <= m.value && m.value <= 3, // eslint-disable-line yoda
      'test_async_counter value is in [2,3] range, indicating aggregation temporality is the expected "Delta"')

    m = event.metricset.samples.test_async_gauge
    t.ok(-1 <= m.value && m.value <= 1, // eslint-disable-line yoda
      'test_async_gauge value is in [-1,1] range, the expected sine wave range')

    m = event.metricset.samples.test_updowncounter
    t.equal(m.type, 'gauge', 'test_updowncounter.type')
    t.ok(-30 <= m.value && m.value <= 30, // eslint-disable-line yoda
      'test_updowncounter value is in expect [-30,30] range')
  })
}

async function checkHasPrometheusMetrics (t) {
  const { statusCode, body } = await undici.request('http://localhost:9464/metrics')
  t.equal(statusCode, 200, 'prometheus exporter is still working')
  const text = await body.text()
  t.ok(text.indexOf('\ntest_counter') !== -1, 'prometheus metrics include "test_counter"')
}

const cases = [
  {
    script: 'use-just-otel-api.js',
    check: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object')
      await checkEventsHaveTestMetrics(t, events)
    }
  },
  {
    script: 'use-just-otel-sdk.js',
    check: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object')
      await checkEventsHaveTestMetrics(t, events)
      await checkHasPrometheusMetrics(t)
    }
  },
  {
    script: 'use-otel-api-with-registered-meter-provider.js',
    check: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object')
      await checkEventsHaveTestMetrics(t, events)
      await checkHasPrometheusMetrics(t)
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
        function done (_err, stdout, stderr) {
          // We are terminating the process with SIGTERM, so we *expect* a
          // non-zero exit. Hence checking `_err` isn't useful. If there is
          // any output, then show it, in case it is useful for debugging
          // test failures.
          if (stdout.trim() || stderr.trim()) {
            t.comment(`$ node ${scriptPath}\n-- stdout --\n|${formatForTComment(stdout)}\n-- stderr --\n|${formatForTComment(stderr)}\n--`)
          }
          server.close()
          t.end()
        }
      )
      // Wait ~2s for some metrics to have been sent.
      setTimeout(async () => {
        await c.check(t, server.events)
        proc.kill()
      }, 2000)
    })
  })
})
