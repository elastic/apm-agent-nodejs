'use strict'

// Test the OpenTelemetry SDK (aka OpenTelemetry API Bridge) functionality
// of the APM agent.
//
// Most of the tests below execute a script from "fixtures/" something like:
//
//    node -r ../../opentelemetry-sdk.js fixtures/start-span.js
//
// and assert that (a) it exits successfully (passing internal `assert(...)`s),
// and (b) the mock APM server got the expected trace data.
//
// The scripts can be run independent of the test suite. Also, they can be
// run using the *OpenTelemetry SDK* for comparison. E.g.:
//    node -r ../../examples/otel/otel-sdk.js fixtures/start-span.js

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
      t.equal(events.length, 2, 'exactly 2 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')
      const mySpan = findObjInArray(events, 'transaction.name', 'mySpan').transaction
      t.ok(mySpan, 'transaction.name')
      // XXX what else to assert here? outcome? type? OTel attributes?
    }
  },
  {
    // Expect:
    //   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)
    script: 'nonrecordingspan-parent.js',
    check: (t, events) => {
      t.equal(events.length, 2, 'exactly 2 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')
      const s2 = findObjInArray(events, 'transaction.name', 's2').transaction
      t.ok(s2, 'transaction.name')
      t.equal(s2.trace_id, 'd4cda95b652f4a1592b449dd92ffda3b', 'transaction.trace_id')
      t.ok(s2.parent_id, '6e0c63ffe4e34c42', 'transaction.parent_id')
    }
  },
  {
    // Expect:
    //   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)
    script: 'using-root-context.js',
    check: (t, events) => {
      t.equal(events.length, 2, 'exactly 2 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')
      const s2 = findObjInArray(events, 'transaction.name', 's2').transaction
      t.ok(s2, 'transaction.name')
      t.equal(s2.trace_id, 'd4cda95b652f4a1592b449dd92ffda3b', 'transaction.trace_id')
      t.ok(s2.parent_id, '6e0c63ffe4e34c42', 'transaction.parent_id')
    }
  },
  {
    // Expect:
    //    transaction "callServiceA"
    //    `- span "GET localhost:$portA" (context.http.url=http://localhost:$portA/a-ping)
    //      `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
    //         `- span "GET localhost:$portB" (context.http.url=http://localhost:$portB/b-ping)
    //           `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
    script: 'distributed-trace.js',
    check: (t, events) => {
      t.equal(events.length, 6, 'exactly 6 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')
      // All the transactions and spans, in timestamp order.
      const tas = events.slice(1)
        .sort((a, b) => (a.transaction || a.span).timestamp - (b.transaction || b.span).timestamp)
      //  transaction "callServiceA"
      t.equal(tas[0].transaction.name, 'callServiceA')
      //  `- span "GET localhost:$portA" (context.http.url=http://localhost:$portA/a-ping)
      const portA = tas[1].span.context.destination.port
      t.equal(tas[1].span.parent_id, tas[0].transaction.id)
      t.equal(tas[1].span.name, `GET localhost:${portA}`)
      t.ok(tas[1].span.context.http.url, `http://localhost:${portA}/a-ping`)
      //    `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
      t.equal(tas[2].transaction.parent_id, tas[1].span.id)
      t.equal(tas[2].transaction.name, 'GET unknown route')
      t.ok(tas[2].transaction.context.request.headers.traceparent)
      t.equal(tas[2].transaction.context.request.headers.tracestate, 'es=s:1')
      //       `- span "GET localhost:$portB" (context.http.url=http://localhost:$portB/b-ping)
      const portB = tas[3].span.context.destination.port
      t.equal(tas[3].span.parent_id, tas[2].transaction.id)
      t.equal(tas[3].span.name, `GET localhost:${portB}`)
      t.ok(tas[3].span.context.http.url, `http://localhost:${portB}/b-ping`)
      //         `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
      t.equal(tas[4].transaction.parent_id, tas[3].span.id)
      t.equal(tas[4].transaction.name, 'GET unknown route')
      t.ok(tas[4].transaction.context.request.headers.traceparent)
      t.equal(tas[4].transaction.context.request.headers.tracestate, 'es=s:1')
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
