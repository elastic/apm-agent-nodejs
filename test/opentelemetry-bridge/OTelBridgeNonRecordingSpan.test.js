/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../..').start({
  opentelemetryBridgeEnabled: true,
  // Make the agent quiet.
  disableSend: true,
  centralConfig: false,
  cloudProvider: 'none',
  metricsInterval: '0s',
  captureExceptions: false,
  logLevel: 'off',
});

const otel = require('@opentelemetry/api');
const tape = require('tape');
const { OUTCOME_UNKNOWN } = require('../../lib/constants');
const {
  OTelBridgeNonRecordingSpan,
} = require('../../lib/opentelemetry-bridge/OTelBridgeNonRecordingSpan');

tape.test('OTelBridgeNonRecordingSpan', (suite) => {
  const parentSpanContext = {
    traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
    spanId: '6e0c63ffe4e34c42',
    traceFlags: otel.TraceFlags.SAMPLED,
  };
  let nrsOTelSpan;
  let nrsTrans;

  suite.test('setup', (t) => {
    // `nrs` is an instance of the @opentelemetry/api NonRecordingSpan.
    const nrs = otel.trace.wrapSpanContext(parentSpanContext);

    // If we set that span on a Context and use the ContextManager to run in that
    // context (via `otel.context.with()`) ...
    otel.context.with(otel.trace.setSpan(otel.context.active(), nrs), () => {
      // ... then that span passes through the OTel Bridge context management
      // and comes out as an `OTelBridgeNonRecordingSpan` instance.
      nrsOTelSpan = otel.trace.getSpan(otel.context.active());
      t.ok(nrsOTelSpan instanceof OTelBridgeNonRecordingSpan);

      // In Elastic APM terms, that "span" is the current transaction.
      nrsTrans = apm.currentTransaction;
      t.ok(nrsTrans instanceof OTelBridgeNonRecordingSpan);
      t.strictEqual(nrsOTelSpan, nrsTrans);

      t.end();

      // This object must handle:
      // - the full OTel `interface Span`
      // - the full Elastic APM public API `interface Transaction`, and
      // - any internal `class Transaction` API used by the APM agent.
    });
  });

  suite.test('OTel interface Span', (t) => {
    t.deepEqual(nrsOTelSpan.spanContext(), parentSpanContext, 'spanContext');
    t.equal(
      nrsOTelSpan.setAttribute('foo', 'bar'),
      nrsOTelSpan,
      'setAttribute',
    );
    t.equal(
      nrsOTelSpan.setAttributes({ foo: 'bar' }),
      nrsOTelSpan,
      'setAttributes',
    );
    t.equal(nrsOTelSpan.addEvent('anEvent'), nrsOTelSpan, 'addEvent');
    t.equal(
      nrsOTelSpan.setStatus(otel.SpanStatusCode.OK),
      nrsOTelSpan,
      'setStatus',
    );
    t.equal(nrsOTelSpan.updateName('anotherName'), nrsOTelSpan, 'updateName');
    t.equal(nrsOTelSpan.end(), undefined, 'end');
    t.equal(nrsOTelSpan.isRecording(), false, 'isRecording');
    t.equal(
      nrsOTelSpan.recordException(new Error('boom')),
      undefined,
      'recordException',
    );
    t.end();
  });

  suite.test('public interface Transaction API', (t) => {
    t.equal(nrsTrans.name, '', 'name');
    t.equal(nrsTrans.type, null, 'type');
    t.equal(nrsTrans.subtype, null, 'subtype');
    t.equal(nrsTrans.action, null, 'action');
    t.equal(
      nrsTrans.traceparent,
      '00-d4cda95b652f4a1592b449dd92ffda3b-6e0c63ffe4e34c42-01',
      'traceparent',
    );
    t.equal(nrsTrans.outcome, OUTCOME_UNKNOWN, 'outcome');
    t.equal(nrsTrans.result, '', 'result');
    t.deepEqual(
      nrsTrans.ids,
      {
        'trace.id': 'd4cda95b652f4a1592b449dd92ffda3b',
        'transaction.id': '6e0c63ffe4e34c42',
      },
      'ids',
    );

    t.equal(
      nrsTrans.setType('aType', 'aSubtype', 'anAction'),
      undefined,
      'setType',
    );
    t.equal(nrsTrans.setLabel('foo', 'bar'), false, 'setLabel');
    t.equal(nrsTrans.addLabels({ foo: 'bar' }), false, 'addLabels');
    t.equal(nrsTrans.setOutcome(OUTCOME_UNKNOWN), undefined, 'setOutcome');
    t.equal(nrsTrans.startSpan('aSpan', {}), null, 'setSpan');

    t.equal(nrsTrans.ensureParentId(), '', 'ensureParentId');
    t.equal(nrsTrans.end('aResult', 42), undefined, 'end');

    t.end();
  });

  suite.end();
});
