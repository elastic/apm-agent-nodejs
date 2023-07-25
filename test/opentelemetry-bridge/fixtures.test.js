/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Thes tests below execute a script from "fixtures/" something like:
//
//    ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true \
//        node -r ../../start.js fixtures/start-span.js
//
// and assert that (a) it exits successfully (passing internal `assert(...)`s),
// and (b) the mock APM server got the expected trace data.
//
// The scripts can be run independent of the test suite. Also, they can be
// run using the *OpenTelemetry SDK* for comparison. E.g.:
//    node -r ../../examples/otel/otel-sdk.js fixtures/start-span.js

const { execFile } = require('child_process');
const path = require('path');
const semver = require('semver');
const tape = require('tape');
const {
  RESULT_SUCCESS,
  OUTCOME_UNKNOWN,
  OUTCOME_SUCCESS,
  RESULT_FAILURE,
  OUTCOME_FAILURE,
} = require('../../lib/constants');

const { MockAPMServer } = require('../_mock_apm_server');
const { findObjInArray } = require('../_utils');

const haveUsablePerformanceNow = semver.satisfies(process.version, '>=8.12.0');

const cases = [
  {
    // Expect:
    //   transaction "mySpan"
    script: 'start-span.js',
    check: (t, events) => {
      t.equal(events.length, 2, 'exactly 2 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');
      const mySpan = findObjInArray(
        events,
        'transaction.name',
        'mySpan',
      ).transaction;
      t.ok(mySpan, 'transaction.name');
      t.strictEqual(mySpan.outcome, OUTCOME_UNKNOWN, 'transaction.outcome');
      t.strictEqual(
        mySpan.otel.span_kind,
        'INTERNAL',
        'transaction.otel.span_kind',
      );
      t.strictEqual(mySpan.parent_id, undefined, 'transaction.parent_id');
    },
  },

  {
    // Expect:
    //   transaction "s1" (outcome=unknown)
    //   `- span "s2" (outcome=unknown)
    script: 'start-active-span.js',
    check: (t, events) => {
      t.equal(events.length, 3, 'exactly 3 events');
      const s1 = findObjInArray(events, 'transaction.name', 's1').transaction;
      t.ok(s1, 'transaction.name');
      t.strictEqual(s1.outcome, OUTCOME_UNKNOWN, 'transaction.outcome');
      const s2 = findObjInArray(events, 'span.name', 's2').span;
      t.ok(s2, 'span.name');
      t.strictEqual(s2.outcome, OUTCOME_UNKNOWN, 'span.outcome');
      t.strictEqual(s2.parent_id, s1.id, 'span.parent_id');
    },
  },

  {
    // Expect:
    //   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)
    script: 'nonrecordingspan-parent.js',
    check: (t, events) => {
      t.equal(events.length, 2, 'exactly 2 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');
      const s2 = findObjInArray(events, 'transaction.name', 's2').transaction;
      t.ok(s2, 'transaction.name');
      t.equal(
        s2.trace_id,
        'd4cda95b652f4a1592b449dd92ffda3b',
        'transaction.trace_id',
      );
      t.ok(s2.parent_id, '6e0c63ffe4e34c42', 'transaction.parent_id');
    },
  },

  {
    // Expect:
    //   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)
    script: 'using-root-context.js',
    check: (t, events) => {
      t.equal(events.length, 2, 'exactly 2 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');
      const s2 = findObjInArray(events, 'transaction.name', 's2').transaction;
      t.ok(s2, 'transaction.name');
      t.equal(
        s2.trace_id,
        'd4cda95b652f4a1592b449dd92ffda3b',
        'transaction.trace_id',
      );
      t.ok(s2.parent_id, '6e0c63ffe4e34c42', 'transaction.parent_id');
    },
  },

  {
    // Expect:
    //    transaction "callServiceA"
    //    `- span "GET localhost:$portA" (context.http.url=http://localhost:$portA/a-ping)
    //      `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
    //         `- span "GET localhost:$portB" (context.http.url=http://localhost:$portB/b-ping)
    //           `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
    //
    // Dev Note: On Windows GitHub Actions runners the timestamp ordering of
    // the transaction and span events is not reliable.
    script: 'distributed-trace.js',
    check: (t, events) => {
      let e;

      t.equal(events.length, 6, 'exactly 6 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');
      //  transaction "callServiceA"
      e = findObjInArray(events, 'transaction.name', 'callServiceA');
      t.equal(
        e.transaction.parent_id,
        undefined,
        'trans "callServiceA" has no parent_id',
      );
      //  `- span "GET localhost:$portA" (context.http.url=http://localhost:$portA/a-ping)
      e = findObjInArray(events, 'span.parent_id', e.transaction.id);
      const portA = e.span.context.destination.port;
      t.equal(e.span.name, `GET localhost:${portA}`);
      t.ok(e.span.context.http.url, `http://localhost:${portA}/a-ping`);
      //    `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
      e = findObjInArray(events, 'transaction.parent_id', e.span.id);
      t.equal(e.transaction.name, 'GET unknown route');
      t.ok(e.transaction.context.request.headers.traceparent);
      t.equal(e.transaction.context.request.headers.tracestate, 'es=s:1');
      //       `- span "GET localhost:$portB" (context.http.url=http://localhost:$portB/b-ping)
      e = findObjInArray(events, 'span.parent_id', e.transaction.id);
      const portB = e.span.context.destination.port;
      t.equal(e.span.name, `GET localhost:${portB}`);
      t.ok(e.span.context.http.url, `http://localhost:${portB}/b-ping`);
      //         `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
      e = findObjInArray(events, 'transaction.parent_id', e.span.id);
      t.equal(e.transaction.name, 'GET unknown route');
      t.ok(e.transaction.context.request.headers.traceparent);
      t.equal(e.transaction.context.request.headers.tracestate, 'es=s:1');
    },
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
      t.equal(events.length, 7, 'exactly 7 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');
      // All the transactions and spans, in order of creation.
      // (Because of https://github.com/elastic/apm-agent-nodejs/issues/2180
      // we cannot use "timestamp" for sorting.)
      const tas = events
        .slice(1)
        .sort((a, b) =>
          (a.transaction || a.span).name > (b.transaction || b.span).name
            ? 1
            : -1,
        );
      t.equal(tas[0].transaction.name, 's1', 's1.name');
      t.equal(tas[0].transaction.parent_id, undefined, 's1 has no parent');
      const traceId = tas[0].transaction.trace_id;
      t.equal(tas[1].transaction.name, 's2', 's2.name');
      t.equal(tas[1].transaction.parent_id, undefined, 's2 has no parent');
      t.notEqual(
        tas[1].transaction.trace_id,
        traceId,
        's2 has a separate trace id',
      );
      t.equal(tas[2].span.name, 's3', 's3.name');
      t.equal(
        tas[2].span.parent_id,
        tas[0].transaction.id,
        's3 is a child of s1',
      );
      t.equal(tas[3].transaction.name, 's4', 's4.name');
      t.equal(
        tas[3].transaction.parent_id,
        tas[0].transaction.id,
        's4 is a child of s1',
      );
      t.equal(tas[4].span.name, 's5', 's5.name');
      t.equal(tas[4].span.parent_id, tas[2].span.id, 's5 is a child of s3');
      t.equal(tas[5].span.name, 's6', 's6.name');
      t.equal(
        tas[5].span.parent_id,
        tas[0].transaction.id,
        's4 is a child of s1',
      );
    },
  },

  {
    // Expected trace:
    //    trace $traceId
    //    `- transaction "aTrans"
    //       `- span "anExitSpan"
    //         `- transaction "GET unknown route"
    script: 'createSpan-returns-null.js',
    check: (t, events) => {
      t.equal(events.length, 4, 'exactly 4 events');
      t.ok(events[0].metadata, 'APM server got event metadata object');

      // All the transactions and spans, in order of creation.
      const tas = events
        .slice(1)
        .sort((a, b) =>
          (a.transaction || a.span).timestamp >
          (b.transaction || b.span).timestamp
            ? 1
            : -1,
        );
      //    trace $traceId
      const traceId = tas[0].transaction.trace_id;
      tas.forEach((s) => {
        t.equal((s.transaction || s.span).trace_id, traceId, 'traceId');
      });
      //    `- transaction "aTrans"
      const aTrans = tas[0].transaction;
      t.equal(aTrans.name, 'aTrans', 'aTrans.name');
      //       `- span "anExitSpan"
      const anExitSpan = tas[1].span;
      t.equal(anExitSpan.name, 'anExitSpan', 'anExitSpan');
      t.equal(anExitSpan.parent_id, aTrans.id, 'anExitSpan.parent_id');
      //         `- transaction "GET unknown route"
      const trans = tas[2].transaction;
      t.equal(
        trans.name,
        'GET unknown route',
        'incoming http transaction.name',
      );
      t.equal(
        trans.parent_id,
        anExitSpan.id,
        'incoming http transaction.parent_id',
      );
      t.ok(
        trans.context.request.headers.traceparent,
        'incoming http "traceparent" header',
      );
      t.ok(
        trans.context.request.headers['elastic-apm-traceparent'],
        'incoming http "elastic-apm-traceparent" header',
      );
      t.ok(
        (trans.context.request.headers.tracestate || '').indexOf('es=s:1') !==
          -1,
        'incoming http "tracestate" header has expected "es=" section',
      );
    },
  },

  {
    script: 'interface-span.js',
    check: (t, events) => {
      // Span#setAttribute, Span#setAttributes
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
        'an.array.with.undefineds': ['one', null, 'three'],
      };
      t.deepEqual(
        findObjInArray(events, 'transaction.name', 'sSetAttribute').transaction
          .otel.attributes,
        expectedAttributes,
        'sSetAttribute',
      );
      t.deepEqual(
        findObjInArray(events, 'transaction.name', 'sSetAttributes').transaction
          .otel.attributes,
        expectedAttributes,
        'sSetAttributes',
      );

      // Span#addEvent
      t.ok(
        findObjInArray(events, 'transaction.name', 'sAddEvent').transaction,
        'sAddEvent',
      );

      // Span#setStatus
      const sSetStatusDoNotSet = findObjInArray(
        events,
        'transaction.name',
        'sSetStatusDoNotSet',
      ).transaction;
      t.equal(
        sSetStatusDoNotSet.result,
        RESULT_SUCCESS,
        'sSetStatusDoNotSet.result',
      );
      t.equal(
        sSetStatusDoNotSet.outcome,
        OUTCOME_UNKNOWN,
        'sSetStatusDoNotSet.outcome',
      );
      const sSetStatusUNSET = findObjInArray(
        events,
        'transaction.name',
        'sSetStatusUNSET',
      ).transaction;
      t.equal(sSetStatusUNSET.result, RESULT_SUCCESS, 'sSetStatusUNSET.result');
      t.equal(
        sSetStatusUNSET.outcome,
        OUTCOME_UNKNOWN,
        'sSetStatusUNSET.outcome',
      );
      const sSetStatusOK = findObjInArray(
        events,
        'transaction.name',
        'sSetStatusOK',
      ).transaction;
      t.equal(sSetStatusOK.result, RESULT_SUCCESS, 'sSetStatusOK.result');
      t.equal(sSetStatusOK.outcome, OUTCOME_SUCCESS, 'sSetStatusOK.outcome');
      const sSetStatusERROR = findObjInArray(
        events,
        'transaction.name',
        'sSetStatusERROR',
      ).transaction;
      t.equal(sSetStatusERROR.result, RESULT_FAILURE, 'sSetStatusERROR.result');
      t.equal(
        sSetStatusERROR.outcome,
        OUTCOME_FAILURE,
        'sSetStatusERROR.outcome',
      );
      const sSetStatusMulti = findObjInArray(
        events,
        'transaction.name',
        'sSetStatusMulti',
      ).transaction;
      t.equal(sSetStatusMulti.result, RESULT_SUCCESS, 'sSetStatusMulti.result');
      t.equal(
        sSetStatusMulti.outcome,
        OUTCOME_SUCCESS,
        'sSetStatusMulti.outcome',
      );
      const sSetStatusChildERROR = findObjInArray(
        events,
        'span.name',
        'sSetStatusChildERROR',
      ).span;
      t.equal(
        sSetStatusChildERROR.outcome,
        OUTCOME_FAILURE,
        'sSetStatusChildERROR.outcome',
      );

      t.strictEqual(
        findObjInArray(
          events,
          'transaction.otel.attributes.testId',
          'sUpdateName',
        ).transaction.name,
        'three',
        'sUpdateName',
      );

      // Span#end
      function spanEndTimeIsApprox(transOrSpanName, t = Date.now()) {
        const foundTrans = findObjInArray(
          events,
          'transaction.name',
          transOrSpanName,
        );
        const genericSpan = foundTrans
          ? foundTrans.transaction
          : findObjInArray(events, 'span.name', transOrSpanName).span;
        const endTimeMs = genericSpan.timestamp / 1000 + genericSpan.duration;
        const msFromT = Math.abs(t - endTimeMs);
        return msFromT < 30 * 1000; // within 30s
      }
      t.ok(spanEndTimeIsApprox('sEndTimeNotSpecified'), 'sEndTimeNotSpecified');
      t.ok(spanEndTimeIsApprox('sEndTimeHrTime'), 'sEndTimeHrTime');
      t.ok(spanEndTimeIsApprox('sEndTimeEpochMs'), 'sEndTimeEpochMs');
      if (haveUsablePerformanceNow) {
        t.ok(
          spanEndTimeIsApprox('sEndTimePerformanceNow'),
          'sEndTimePerformanceNow',
        );
      }
      t.ok(spanEndTimeIsApprox('sEndTimeDate'), 'sEndTimeDate');
      t.ok(spanEndTimeIsApprox('sEndChildTimeDate'), 'sEndChildTimeDate');
      const HOUR = 1 * 60 * 60 * 1000; // an hour in milliseconds
      t.ok(
        spanEndTimeIsApprox('sEndOneHourAgo', Date.now() - HOUR),
        'sEndOneHourAgo end time is 1h ago',
      );
      const sEndOneHourAgo = findObjInArray(
        events,
        'transaction.name',
        'sEndOneHourAgo',
      ).transaction;
      t.equal(
        sEndOneHourAgo.duration,
        HOUR,
        `sEndOneHourAgo duration is 1h: ${sEndOneHourAgo.duration}`,
      );
      t.ok(
        spanEndTimeIsApprox('sEndOneHourFromNow', Date.now() + HOUR),
        'sEndOneHourFromNow end time is 1h from now',
      );
      const sEndOneHourFromNow = findObjInArray(
        events,
        'transaction.name',
        'sEndOneHourFromNow',
      ).transaction;
      t.equal(
        sEndOneHourFromNow.duration,
        HOUR,
        `sEndOneHourFromNow duration is 1h: ${sEndOneHourFromNow.duration}`,
      );

      // Span#isRecording()
      t.ok(
        findObjInArray(events, 'transaction.name', 'sIsRecordingSampled'),
        'sIsRecordingSampled',
      );

      // Span#recordException()
      function errorTimestampIsApprox(error, t = Date.now()) {
        const msFromT = Math.abs(t - error.timestamp / 1e3);
        return msFromT < 30 * 1000; // within 30s
      }
      const now = Date.now();
      const sRecordException = findObjInArray(
        events,
        'transaction.name',
        'sRecordException',
      ).transaction;
      // - new Error('an Error')
      const eAnError = findObjInArray(
        events,
        'error.exception.message',
        'an Error',
      ).error;
      t.strictEqual(
        eAnError.parent_id,
        sRecordException.id,
        'eAnError.parent_id',
      );
      t.ok(errorTimestampIsApprox(eAnError, now), 'eAnError.timestamp');
      // - fsErr
      const eFsErr = findObjInArray(
        events,
        'error.exception.code',
        'ENOENT',
      ).error;
      t.strictEqual(eFsErr.parent_id, sRecordException.id, 'eFsErr.parent_id');
      t.ok(errorTimestampIsApprox(eFsErr, now), 'eFsErr.timestamp');
      // - 'a string'
      const eAString = findObjInArray(
        events,
        'error.log.message',
        'a string',
      ).error;
      t.strictEqual(
        eAString.parent_id,
        sRecordException.id,
        'eAString.parent_id',
      );
      t.ok(errorTimestampIsApprox(eAString, now), 'eAString.timestamp');
      // - new Error('one hour ago')
      const eOneHourAgo = findObjInArray(
        events,
        'error.exception.message',
        'one hour ago',
      ).error;
      t.strictEqual(
        eOneHourAgo.parent_id,
        sRecordException.id,
        'eOneHourAgo.parent_id',
      );
      t.ok(
        errorTimestampIsApprox(eOneHourAgo, now - HOUR),
        'eOneHourAgo.timestamp',
      );
      // - new Error('after span end works')
      const aAfterEnd = findObjInArray(
        events,
        'error.exception.message',
        'after span end works',
      ).error;
      t.strictEqual(
        aAfterEnd.parent_id,
        sRecordException.id,
        'aAfterEnd.parent_id',
      );
      t.ok(errorTimestampIsApprox(aAfterEnd, now), 'aAfterEnd.timestamp');
    },
  },

  {
    script: 'interface-tracer.js',
    check: (t, events) => {
      // SpanOptions.kind
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindDefault').transaction
          .otel.span_kind,
        'INTERNAL',
        'sKindDefault',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindInternal').transaction
          .otel.span_kind,
        'INTERNAL',
        'sKindInternal',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindServer').transaction
          .otel.span_kind,
        'SERVER',
        'sKindServer',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindClient').transaction
          .otel.span_kind,
        'CLIENT',
        'sKindClient',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindProducer').transaction
          .otel.span_kind,
        'PRODUCER',
        'sKindProducer',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sKindConsumer').transaction
          .otel.span_kind,
        'CONSUMER',
        'sKindConsumer',
      );

      // SpanOptions.attributes
      t.equal(
        findObjInArray(events, 'transaction.name', 'sAttributesNone')
          .transaction.otel.attributes,
        undefined,
        'sAttributesNone',
      );
      t.deepEqual(
        findObjInArray(events, 'transaction.name', 'sAttributesLots')
          .transaction.otel.attributes,
        {
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
          'an.array.with.undefineds': ['one', null, 'three'],
        },
        'sAttributesLots',
      );

      // SpanOptions.links (not yet supported)
      const sLinksNone = findObjInArray(
        events,
        'transaction.name',
        'sLinksNone',
      ).transaction;
      t.equal(sLinksNone.links, undefined, 'sLinksNone');
      t.equal(
        findObjInArray(events, 'transaction.name', 'sLinksEmptyArray')
          .transaction.links,
        undefined,
        'sLinksEmptyArray',
      );
      t.equal(
        findObjInArray(events, 'transaction.name', 'sLinksInvalid').transaction
          .links,
        undefined,
        'sLinksInvalid',
      );
      t.deepEqual(
        findObjInArray(events, 'transaction.name', 'sLinks').transaction.links,
        [
          {
            trace_id: sLinksNone.trace_id,
            span_id: sLinksNone.id,
          },
        ],
        'sLinks',
      );
      t.deepEqual(
        findObjInArray(events, 'transaction.name', 'sLinksWithAttrs')
          .transaction.links,
        [
          {
            trace_id: sLinksNone.trace_id,
            span_id: sLinksNone.id,
          },
        ],
        'sLinksWithAttrs',
      );

      // SpanOptions.startTime
      function transTimestampIsRecent(name) {
        const trans = findObjInArray(
          events,
          'transaction.name',
          name,
        ).transaction;
        const msFromNow = Math.abs(Date.now() - trans.timestamp / 1000);
        return msFromNow < 30 * 1000; // within 30s
      }
      t.ok(transTimestampIsRecent('sStartTimeHrTime'), 'sStartTimeHrTime');
      t.ok(transTimestampIsRecent('sStartTimeEpochMs'), 'sStartTimeEpochMs');
      if (haveUsablePerformanceNow) {
        t.ok(
          transTimestampIsRecent('sStartTimePerformanceNow'),
          'sStartTimePerformanceNow',
        );
      }
      t.ok(transTimestampIsRecent('sStartTimeDate'), 'sStartTimeDate');

      // SpanOptions.root
      const sParent = findObjInArray(
        events,
        'transaction.name',
        'sParent',
      ).transaction;
      const sRootNotSpecified = findObjInArray(
        events,
        'span.name',
        'sRootNotSpecified',
      ).span;
      t.equal(
        sRootNotSpecified.trace_id,
        sParent.trace_id,
        'sRootNotSpecified.trace_id',
      );
      t.equal(
        sRootNotSpecified.parent_id,
        sParent.id,
        'sRootNotSpecified.parent_id',
      );
      const sRoot = findObjInArray(
        events,
        'transaction.name',
        'sRoot',
      ).transaction;
      t.notEqual(sRoot.trace_id, sParent.trace_id, 'sRoot.trace_id');
      t.strictEqual(sRoot.parent_id, undefined, 'sRoot.parent_id');

      // tracer.startActiveSpan()
      t.ok(
        findObjInArray(events, 'transaction.name', 'sActiveRetval').transaction,
        'sActiveRetval',
      );
      t.ok(
        findObjInArray(events, 'transaction.name', 'sActiveThrows').transaction,
        'sActiveThrows',
      );
      t.ok(
        findObjInArray(events, 'transaction.name', 'sActiveAsync').transaction,
        'sActiveAsync',
      );
      const sActiveWithOptions = findObjInArray(
        events,
        'transaction.name',
        'sActiveWithOptions',
      ).transaction;
      t.strictEqual(
        sActiveWithOptions.otel.span_kind,
        'CLIENT',
        'sActiveWithOptions span_kind',
      );
      t.deepEqual(
        sActiveWithOptions.otel.attributes,
        { 'a.string': 'hi' },
        'sActiveWithOptions attributes',
      );
      t.ok(
        findObjInArray(events, 'transaction.name', 'sActiveWithContext')
          .transaction,
        'sActiveWithContext',
      );
    },
  },
];

cases.forEach((c) => {
  tape.test(
    `test/opentelemetry-bridge/fixtures/${c.script}`,
    c.testOpts || {},
    (t) => {
      const server = new MockAPMServer();
      const scriptPath = path.join('fixtures', c.script);
      server.start(function (serverUrl) {
        execFile(
          process.execPath,
          ['-r', '../../start.js', scriptPath],
          {
            cwd: __dirname,
            timeout: 10000, // guard on hang, 3s is sometimes too short for CI
            env: Object.assign({}, process.env, c.env, {
              ELASTIC_APM_SERVER_URL: serverUrl,
              ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED: 'true',
              // Silence optional features of the agent. Removing metrics
              // allows some of the above tests to make assumptions about
              // which events the APM server receives.
              ELASTIC_APM_CENTRAL_CONFIG: 'false',
              ELASTIC_APM_CLOUD_PROVIDER: 'none',
              ELASTIC_APM_METRICS_INTERVAL: '0s',
              ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS: 'true',
            }),
          },
          function done(err, _stdout, _stderr) {
            t.error(err, `${scriptPath} exited non-zero`);
            if (err) {
              t.comment('skip checks because script errored out');
            } else {
              c.check(t, server.events);
            }
            server.close();
            t.end();
          },
        );
      });
    },
  );
});
