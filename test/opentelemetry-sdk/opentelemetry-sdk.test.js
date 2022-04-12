'use strict'

// Test the OpenTelemetry SDK (aka OpenTelemetry API Bridge) functionality
// of the APM agent.
//
// Most of the tests below execute a script from "fixtures/" something like:
//
//    node -r ../../opentelemetry-sdk.js fixtures/start-span.js
//
// and assert that (a) the exits successfully (passing internal `assert(...)`s),
// and (b) the mock APM server got the expected trace.
//
// The scripts can be run independent of the test suite.

const { execFile } = require('child_process')
const path = require('path')
const tape = require('tape')

const { MockAPMServer } = require('../_mock_apm_server')
const { findObjInArray } = require('../_utils')

const cases = [
  {
    // Expect:
    //   transaction "mySpan"
    script: 'start-span.js',
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object')
      t.equal(events.length, 2, 'exactly 2 events')
      const mySpan = findObjInArray(events, 'transaction.name', 'mySpan').transaction
      t.ok(mySpan, 'transaction.name')
      // XXX what else to assert here? outcome? type? OTel attributes?
    }
  }
]

cases.forEach(c => {
  tape.test(`opentelemetry-sdk/fixtures/${c.script}`, c.testOpts || {}, t => {
    const server = new MockAPMServer()
    const scriptPath = path.join('fixtures', c.script)
    server.start(function (serverUrl) {
      execFile(
        process.execPath,
        ['-r', '../../opentelemetry-sdk.js', scriptPath],
        {
          cwd: __dirname,
          timeout: 10000, // guard on hang, 3s is sometimes too short for CI
          env: Object.assign({}, process.env, {
            ELASTIC_APM_SERVER_URL: serverUrl
          })
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
    })
  })
})
