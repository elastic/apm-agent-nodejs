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
const semver = require('semver')
const tape = require('tape')

const { MockAPMServer } = require('../_mock_apm_server')
const { findObjInArray } = require('../_utils')

const haveUsablePerformanceNow = semver.satisfies(process.version, '>=8.12.0')

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
  },

  {
    // Expect:
    //   trace
    //   `- transaction "s1"
    //     `- span "s3"
    //       `- span "s5"
    //     `- transaction "s4"
    //     `- span "s6"
    //   trace
    //   `- transaction "s2"
    script: 'start-span-with-context.js',
    check: (t, events) => {
      t.equal(events.length, 7, 'exactly 7 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')
      // All the transactions and spans, in order of creation.
      // (Because of https://github.com/elastic/apm-agent-nodejs/issues/2180
      // we cannot use "timestamp" for sorting.)
      const tas = events.slice(1)
        .sort((a, b) => (a.transaction || a.span).name > (b.transaction || b.span).name ? 1 : -1)
      t.equal(tas[0].transaction.name, 's1', 's1.name')
      t.equal(tas[0].transaction.parent_id, undefined, 's1 has no parent')
      const traceId = tas[0].transaction.trace_id
      t.equal(tas[1].transaction.name, 's2', 's2.name')
      t.equal(tas[1].transaction.parent_id, undefined, 's2 has no parent')
      t.notEqual(tas[1].transaction.trace_id, traceId, 's2 has a separate trace id')
      t.equal(tas[2].span.name, 's3', 's3.name')
      t.equal(tas[2].span.parent_id, tas[0].transaction.id, 's3 is a child of s1')
      t.equal(tas[3].transaction.name, 's4', 's4.name')
      t.equal(tas[3].transaction.parent_id, tas[0].transaction.id, 's4 is a child of s1')
      t.equal(tas[4].span.name, 's5', 's5.name')
      t.equal(tas[4].span.parent_id, tas[2].span.id, 's5 is a child of s3')
      t.equal(tas[5].span.name, 's6', 's6.name')
      t.equal(tas[5].span.parent_id, tas[0].transaction.id, 's4 is a child of s1')
    }
  },

  {
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
    script: 'hit-transaction-max-spans.js',
    testOpts: {
      // - This fixture fails with node.js [10.0, 10.4) due to an async context
      //   issue. See https://github.com/nodejs/node/issues/20274
      // - This fixture hits a limitation/bug with asyncHooks=false. See XXX.
      skip: (semver.satisfies(process.version, '>=10.0.0 <10.4') ||
        process.env.ELASTIC_APM_ASYNC_HOOKS === 'false')
    },
    env: {
      ELASTIC_APM_TRANSACTION_MAX_SPANS: '3'
    },
    check: (t, events) => {
      t.equal(events.length, 10, 'exactly 10 events')
      t.ok(events[0].metadata, 'APM server got event metadata object')

      // XXX test that tracestate header is also getting through.

      // All the transactions and spans, in order of creation.
      const tas = events.slice(1)
        .sort((a, b) => (a.transaction || a.span).timestamp > (b.transaction || b.span).timestamp ? 1 : -1)
      //   trace $traceId
      const traceId = tas[0].transaction.trace_id
      tas.forEach(s => {
        t.equal((s.transaction || s.span).trace_id, traceId, 'traceId')
      })
      //   `- transaction $myTransId "myTrans"
      const myTrans = tas[0].transaction
      t.equal(myTrans.name, 'myTrans', 'myTrans.name')
      t.deepEqual(myTrans.span_count, { started: 3, dropped: 4 }, 'myTrans.span_count')
      //     `- span "s0"
      const s0 = tas[1].span
      t.equal(s0.name, 's0', 's0')
      t.equal(s0.parent_id, myTrans.id, 's0.parent_id')
      //       `- span "GET localhost:$port" (http)
      t.equal(tas[2].span.subtype, 'http', 'http span.subtype')
      t.equal(tas[2].span.parent_id, s0.id, 'http span.parent_id')
      //         `- transaction "GET unknown route"
      t.equal(tas[3].transaction.name, 'GET unknown route', 'incoming http transaction.name')
      t.equal(tas[3].transaction.parent_id, tas[2].span.id, 'incoming http transaction.parent_id')
      //     `- span "s1"                           // This is the 3rd (max) span.
      const s1 = tas[4].span
      t.equal(s1.name, 's1', 's1')
      t.equal(s1.parent_id, myTrans.id, 's1.parent_id')
      //       `- transaction "GET unknown route"
      t.equal(tas[5].transaction.name, 'GET unknown route', 'incoming http transaction.name')
      t.equal(tas[5].transaction.parent_id, tas[4].span.id, 'incoming http transaction.parent_id')
      //     `- transaction "GET unknown route"
      //     `- transaction "GET unknown route"
      //     `- transaction "GET unknown route"
      for (let i = 6; i < 9; i++) {
        t.equal(tas[i].transaction.name, 'GET unknown route', 'incoming http transaction.name')
        t.equal(tas[i].transaction.parent_id, myTrans.id, 'incoming http transaction.parent_id')
      }
    }
  },

  {
    script: 'interface-span.js',
    check: (t, events) => {
      const expectedAttributes = {
        'a.string': 'hi',
        'a.number': 42,
        'a.boolean': true,
        'an.array.of.strings': ['one', 'two', 'three'],
        'an.array.of.numbers': [1, 2, 3],
        'an.array.of.booleans': [true, false],
        'an.array.that.will.be.modified': ['hello', 'bob'],
        'a.zero': 0,
        'a.false': false,
        'an.empty.string': '',
        'an.empty.array': [],
        'an.array.with.nulls': ['one', null, 'three'],
        'an.array.with.undefineds': ['one', null, 'three']
      }
      t.deepEqual(findObjInArray(events, 'transaction.name', 'sSetAttribute').transaction.otel.attributes,
        expectedAttributes, 'sSetAttribute')
      t.deepEqual(findObjInArray(events, 'transaction.name', 'sSetAttributes').transaction.otel.attributes,
        expectedAttributes, 'sSetAttributes')

      t.ok(findObjInArray(events, 'transaction.name', 'sAddEvent').transaction, 'sAddEvent')

      // XXX
    }
  },
  // XXX attr mapping in separate test file
  //    https://github.com/elastic/apm/blob/main/specs/agents/tracing-api-otel.md#attributes-mapping
  {
    script: 'interface-tracer.js',
    check: (t, events) => {
      // SpanOptions.kind
      t.equal(findObjInArray(events, 'transaction.name', 'sKindDefault').transaction.otel.span_kind, 'INTERNAL', 'sKindDefault')
      t.equal(findObjInArray(events, 'transaction.name', 'sKindInternal').transaction.otel.span_kind, 'INTERNAL', 'sKindInternal')
      t.equal(findObjInArray(events, 'transaction.name', 'sKindServer').transaction.otel.span_kind, 'SERVER', 'sKindServer')
      t.equal(findObjInArray(events, 'transaction.name', 'sKindClient').transaction.otel.span_kind, 'CLIENT', 'sKindClient')
      t.equal(findObjInArray(events, 'transaction.name', 'sKindProducer').transaction.otel.span_kind, 'PRODUCER', 'sKindProducer')
      t.equal(findObjInArray(events, 'transaction.name', 'sKindConsumer').transaction.otel.span_kind, 'CONSUMER', 'sKindConsumer')

      // SpanOptions.attributes
      t.equal(findObjInArray(events, 'transaction.name', 'sAttributesNone').transaction.otel.attributes, undefined, 'sAttributesNone')
      t.deepEqual(findObjInArray(events, 'transaction.name', 'sAttributesLots').transaction.otel.attributes, {
        'a.string': 'hi',
        'a.number': 42,
        'a.boolean': true,
        'an.array.of.strings': ['one', 'two', 'three'],
        'an.array.of.numbers': [1, 2, 3],
        'an.array.of.booleans': [true, false],
        'an.array.that.will.be.modified': ['hello', 'bob'],
        'a.zero': 0,
        'a.false': false,
        'an.empty.string': '',
        'an.empty.array': [],
        'an.array.with.nulls': ['one', null, 'three'],
        'an.array.with.undefineds': ['one', null, 'three']
      }, 'sAttributesLots')

      // SpanOptions.links (not yet supported)
      t.equal(findObjInArray(events, 'transaction.name', 'sLinksNone').transaction.links, undefined, 'sLinksNone')
      t.equal(findObjInArray(events, 'transaction.name', 'sLinksEmptyArray').transaction.links, undefined, 'sLinksEmptyArray')
      t.equal(findObjInArray(events, 'transaction.name', 'sLinksInvalid').transaction.links, undefined, 'sLinksInvalid')
      t.equal(findObjInArray(events, 'transaction.name', 'sLinks').transaction.links, undefined, 'sLinks')
      t.equal(findObjInArray(events, 'transaction.name', 'sLinksWithAttrs').transaction.links, undefined, 'sLinksWithAttrs')

      // SpanOptions.startTime
      function transTimestampIsRecent (name) {
        const trans = findObjInArray(events, 'transaction.name', name).transaction
        const msFromNow = Math.abs(Date.now() - trans.timestamp / 1000)
        return msFromNow < 30 * 1000 // within 30s
      }
      t.ok(transTimestampIsRecent('sStartTimeHrTime'), 'sStartTimeHrTime')
      t.ok(transTimestampIsRecent('sStartTimeEpochMs'), 'sStartTimeEpochMs')
      if (haveUsablePerformanceNow) {
        t.ok(transTimestampIsRecent('sStartTimePerformanceNow'), 'sStartTimePerformanceNow')
      }
      t.ok(transTimestampIsRecent('sStartTimeDate'), 'sStartTimeDate')

      // SpanOptions.root
      const sParent = findObjInArray(events, 'transaction.name', 'sParent').transaction
      const sRootNotSpecified = findObjInArray(events, 'span.name', 'sRootNotSpecified').span
      t.equal(sRootNotSpecified.trace_id, sParent.trace_id, 'sRootNotSpecified.trace_id')
      t.equal(sRootNotSpecified.parent_id, sParent.id, 'sRootNotSpecified.parent_id')
      const sRoot = findObjInArray(events, 'transaction.name', 'sRoot').transaction
      t.notEqual(sRoot.trace_id, sParent.trace_id, 'sRoot.trace_id')
      t.strictEqual(sRoot.parent_id, undefined, 'sRoot.parent_id')

      // tracer.startActiveSpan()
      t.ok(findObjInArray(events, 'transaction.name', 'sActiveRetval').transaction, 'sActiveRetval')
      t.ok(findObjInArray(events, 'transaction.name', 'sActiveThrows').transaction, 'sActiveThrows')
      t.ok(findObjInArray(events, 'transaction.name', 'sActiveAsync').transaction, 'sActiveAsync')
      const sActiveWithOptions = findObjInArray(events, 'transaction.name', 'sActiveWithOptions').transaction
      t.strictEqual(sActiveWithOptions.otel.span_kind, 'CLIENT', 'sActiveWithOptions span_kind')
      t.deepEqual(sActiveWithOptions.otel.attributes, { 'a.string': 'hi' }, 'sActiveWithOptions attributes')
      t.ok(findObjInArray(events, 'transaction.name', 'sActiveWithContext').transaction, 'sActiveWithContext')
    }
  }
]

cases.forEach(c => {
  // if (c.script.indexOf('interface') === -1) return // XXX filter

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
          env: Object.assign(
            {},
            process.env,
            c.env,
            { ELASTIC_APM_SERVER_URL: serverUrl }
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
    })
  })
})
