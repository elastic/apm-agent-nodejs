/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

process.env.ELASTIC_APM_TEST = true;

const { CapturingTransport } = require('../_capturing_transport');
const agent = require('../..').start({
  serviceName: 'test-span',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  transport() {
    return new CapturingTransport();
  },
});

var test = require('tape');

var assert = require('../_assert');
var Transaction = require('../../lib/instrumentation/transaction');
var Span = require('../../lib/instrumentation/span');

test('init', function (t) {
  t.test('properties', function (t) {
    var trans = new Transaction(agent);
    var span = new Span(trans, 'sig', 'type');
    t.ok(/^[\da-f]{16}$/.test(span.id));
    t.ok(/^[\da-f]{32}$/.test(span.traceId));
    t.ok(/^[\da-f]{16}$/.test(span.parentId));
    t.ok(
      /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(span.traceparent),
    );
    t.strictEqual(span.transaction, trans);
    t.strictEqual(span.name, 'sig');
    t.strictEqual(span.type, 'type');
    t.strictEqual(span.ended, false);
    t.end();
  });

  t.test('options.childOf', function (t) {
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    var trans = new Transaction(agent);
    var span = new Span(trans, 'sig', 'type', { childOf });
    t.strictEqual(span._context.traceparent.version, '00');
    t.strictEqual(
      span._context.traceparent.traceId,
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    t.notEqual(span._context.traceparent.id, '00f067aa0ba902b7');
    t.strictEqual(span._context.traceparent.parentId, '00f067aa0ba902b7');
    t.strictEqual(span._context.traceparent.flags, '01');
    t.end();
  });

  t.test('options.links (no links)', function (t) {
    const theTrans = agent.startTransaction('theTransName');
    agent._apmClient.clear();
    theTrans.startSpan('theSpanName', { links: [] }).end();
    agent.flush(() => {
      t.deepEqual(agent._apmClient.spans[0].links, undefined, 'no links');
      theTrans.end();
      t.end();
    });
  });

  t.test('options.links (from invalid link)', function (t) {
    const theTrans = agent.startTransaction('theTransName');
    agent._apmClient.clear();
    theTrans.startSpan('theSpanName', { links: [42] }).end();
    agent.flush(() => {
      t.deepEqual(
        agent._apmClient.spans[0].links,
        undefined,
        'no span link from an invalid link',
      );
      theTrans.end();
      t.end();
    });
  });

  t.test('options.links (from traceparent)', function (t) {
    const theTrans = agent.startTransaction('theTransName');
    agent._apmClient.clear();
    const aTraceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    theTrans
      .startSpan('theSpanName', {
        links: [{ context: aTraceparent }],
      })
      .end();
    agent.flush(() => {
      t.deepEqual(
        agent._apmClient.spans[0].links,
        [
          {
            trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
            span_id: '00f067aa0ba902b7',
          },
        ],
        'a span link from a traceparent',
      );
      theTrans.end();
      t.end();
    });
  });

  t.test('options.links (from Transaction and Span)', function (t) {
    const aTrans = agent.startTransaction('aTrans');
    const aSpan = aTrans.startSpan('aSpan');

    const theTrans = agent.startTransaction('theTransName');
    agent._apmClient.clear();
    theTrans
      .startSpan('theSpanName', {
        links: [{ context: aTrans }, { context: aSpan }],
      })
      .end();
    agent.flush(() => {
      t.deepEqual(
        agent._apmClient.spans[0].links,
        [
          {
            trace_id: aTrans.traceId,
            span_id: aTrans.id,
          },
          {
            trace_id: aSpan.traceId,
            span_id: aSpan.id,
          },
        ],
        'a span link from a Transaction and a Span',
      );

      aSpan.end();
      aTrans.end();
      theTrans.end();
      t.end();
    });
  });
});

test('#end()', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans, 'sig', 'type');
  t.strictEqual(span.ended, false);
  span.end();
  t.strictEqual(span.ended, true);
  t.end();
});

test('#duration()', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  setTimeout(function () {
    span.end();
    t.ok(span.duration() > 49, span.duration() + ' should be larger than 49');
    t.end();
  }, 50);
});

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  t.strictEqual(span.duration(), null);
  t.end();
});

test('custom start time', function (t) {
  var trans = new Transaction(agent);
  var startTime = Date.now() - 1000;
  var span = new Span(trans, 'sig', 'type', { childOf: trans, startTime });
  span.end();
  var duration = span.duration();
  t.ok(
    duration > 990,
    `duration should be circa more than 1s (was: ${duration})`,
  ); // we've seen 998.752 in the wild
  t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`);
  t.end();
});

test('#end(time)', function (t) {
  var trans = new Transaction(agent);
  var startTime = Date.now() - 1000;
  var endTime = startTime + 2000.123;
  var span = new Span(trans, 'sig', 'type', { childOf: trans, startTime });
  span.end(endTime);
  t.strictEqual(span.duration(), 2000.123);
  t.end();
});

test('#setLabel', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent);
    var span = new Span(trans);
    t.strictEqual(span._labels, null);
    t.strictEqual(span.setLabel(), false);
    t.strictEqual(span._labels, null);
    span.setLabel('foo', 1);
    t.deepEqual(span._labels, { foo: '1' });
    span.setLabel('bar', { baz: 2 });
    t.deepEqual(span._labels, { foo: '1', bar: '[object Object]' });
    span.setLabel('foo', 3);
    t.deepEqual(span._labels, { foo: '3', bar: '[object Object]' });
    t.end();
  });

  t.test('invalid', function (t) {
    var trans = new Transaction(agent);
    var span = new Span(trans);
    t.strictEqual(span._labels, null);
    t.strictEqual(span.setLabel(), false);
    t.strictEqual(span._labels, null);
    span.setLabel('invalid*', 1);
    t.deepEqual(span._labels, { invalid_: '1' });
    span.setLabel('invalid.', 2);
    t.deepEqual(span._labels, { invalid_: '2' });
    span.setLabel('invalid"', 3);
    t.deepEqual(span._labels, { invalid_: '3' });
    t.end();
  });
});

test('#addLabels', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  t.strictEqual(span._labels, null);

  t.strictEqual(span.setLabel(), false);
  t.strictEqual(span._labels, null);

  span.addLabels({ foo: 1 });
  t.deepEqual(span._labels, { foo: '1' });

  span.addLabels({ bar: { baz: 2 } });
  t.deepEqual(span._labels, {
    foo: '1',
    bar: '[object Object]',
  });

  span.addLabels({ foo: 3 });
  t.deepEqual(span._labels, {
    foo: '3',
    bar: '[object Object]',
  });

  span.addLabels({ bux: 'bax', bix: 'bex' });
  t.deepEqual(span._labels, {
    foo: '3',
    bar: '[object Object]',
    bux: 'bax',
    bix: 'bex',
  });

  t.end();
});

test('span.sync', function (t) {
  var trans = agent.startTransaction();

  var span1 = agent.startSpan('span1');
  t.strictEqual(span1.sync, true);

  // This span will be *ended* synchronously. It should stay `span.sync=true`.
  var span2 = agent.startSpan('span2');
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after creation');
  span2.end();
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after end');

  setImmediate(() => {
    span1.end();
    t.strictEqual(span1.sync, false, 'span1.sync=false immediately after end');
    trans.end();
    t.strictEqual(
      span2.sync,
      true,
      'span2.sync=true later after having ended sync',
    );
    t.end();
  });
});

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  span._encode(function (err, payload) {
    t.strictEqual(err.message, 'cannot encode un-ended span');
    t.end();
  });
});

test('#_encode() - ended unnamed', function myTest1(t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  var timerStart = span._timer.start;
  span.end();
  span._encode(function (err, payload) {
    t.error(err);
    t.deepEqual(Object.keys(payload), [
      'id',
      'transaction_id',
      'parent_id',
      'trace_id',
      'name',
      'type',
      'subtype',
      'action',
      'timestamp',
      'duration',
      'context',
      'stacktrace',
      'sync',
      'outcome',
      'sample_rate',
    ]);
    t.ok(/^[\da-f]{16}$/.test(payload.id));
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id));
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id));
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id));
    t.strictEqual(payload.id, span.id);
    t.strictEqual(payload.trace_id, span.traceId);
    t.strictEqual(payload.transaction_id, trans.id);
    t.strictEqual(payload.name, 'unnamed');
    t.strictEqual(payload.type, 'custom');
    t.strictEqual(payload.timestamp, timerStart);
    t.ok(payload.duration > 0);
    t.strictEqual(payload.context, undefined);
    assert.stacktrace(t, 'myTest1', __filename, payload.stacktrace, agent);
    t.end();
  });
});

test('#_encode() - ended named', function myTest2(t) {
  var trans = new Transaction(agent);
  var span = new Span(trans, 'foo', 'bar');
  var timerStart = span._timer.start;
  span.end();
  span._encode(function (err, payload) {
    t.error(err);
    t.deepEqual(Object.keys(payload), [
      'id',
      'transaction_id',
      'parent_id',
      'trace_id',
      'name',
      'type',
      'subtype',
      'action',
      'timestamp',
      'duration',
      'context',
      'stacktrace',
      'sync',
      'outcome',
      'sample_rate',
    ]);
    t.ok(/^[\da-f]{16}$/.test(payload.id));
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id));
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id));
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id));
    t.strictEqual(payload.id, span.id);
    t.strictEqual(payload.trace_id, span.traceId);
    t.strictEqual(payload.transaction_id, trans.id);
    t.strictEqual(payload.name, 'foo');
    t.strictEqual(payload.type, 'bar');
    t.strictEqual(payload.timestamp, timerStart);
    t.ok(payload.duration > 0);
    t.strictEqual(payload.context, undefined);
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent);
    t.end();
  });
});

test('#_encode() - with meta data', function myTest2(t) {
  var trans = new Transaction(agent);
  var span = new Span(trans, 'foo', 'bar');
  var timerStart = span._timer.start;
  span.setDbContext({ statement: 'foo', type: 'bar' });
  span.setLabel('baz', 1);
  span.end();
  span._encode(function (err, payload) {
    t.error(err);
    t.deepEqual(Object.keys(payload), [
      'id',
      'transaction_id',
      'parent_id',
      'trace_id',
      'name',
      'type',
      'subtype',
      'action',
      'timestamp',
      'duration',
      'context',
      'stacktrace',
      'sync',
      'outcome',
      'sample_rate',
    ]);
    t.ok(/^[\da-f]{16}$/.test(payload.id));
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id));
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id));
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id));
    t.strictEqual(payload.id, span.id);
    t.strictEqual(payload.trace_id, span.traceId);
    t.strictEqual(payload.transaction_id, trans.id);
    t.strictEqual(payload.name, 'foo');
    t.strictEqual(payload.type, 'bar');
    t.strictEqual(payload.timestamp, timerStart);
    t.ok(payload.duration > 0);
    t.deepEqual(payload.context, {
      db: { statement: 'foo', type: 'bar' },
      tags: { baz: '1' },
    });
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent);
    t.end();
  });
});

test('#_encode() - disabled stack traces', function (t) {
  const oldValue = agent._conf.spanStackTraceMinDuration;
  agent._conf.spanStackTraceMinDuration = -1;

  var trans = new Transaction(agent);
  var span = new Span(trans);
  var timerStart = span._timer.start;
  span.end();
  span._encode(function (err, payload) {
    t.error(err);
    t.deepEqual(Object.keys(payload), [
      'id',
      'transaction_id',
      'parent_id',
      'trace_id',
      'name',
      'type',
      'subtype',
      'action',
      'timestamp',
      'duration',
      'context',
      'stacktrace',
      'sync',
      'outcome',
      'sample_rate',
    ]);
    t.ok(/^[\da-f]{16}$/.test(payload.id));
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id));
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id));
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id));
    t.strictEqual(payload.id, span.id);
    t.strictEqual(payload.trace_id, span.traceId);
    t.strictEqual(payload.transaction_id, trans.id);
    t.strictEqual(payload.name, 'unnamed');
    t.strictEqual(payload.type, 'custom');
    t.strictEqual(payload.timestamp, timerStart);
    t.ok(payload.duration > 0);
    t.strictEqual(payload.context, undefined);
    t.strictEqual(payload.stacktrace, undefined);

    agent._conf.spanStackTraceMinDuration = oldValue;
    t.end();
  });
});

test('#ids', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  t.deepLooseEqual(span.ids, {
    'trace.id': span.traceId,
    'span.id': span.id,
  });
  t.end();
});

test('#toString()', function (t) {
  var trans = new Transaction(agent);
  var span = new Span(trans);
  t.strictEqual(span.toString(), `trace.id=${span.traceId} span.id=${span.id}`);
  t.end();
});

test('Span API on ended span', function (t) {
  const trans = agent.startTransaction('theTransName');
  const span = trans.startSpan(
    'theSpanName',
    'theSpanType',
    'theSpanSubtype',
    'theSpanAction',
  );
  const traceId = span.traceId;
  const spanId = span.id;
  const traceparentBefore = span.traceparent;
  span.end();

  // Test that full Span API (`interface Span` in index.d.ts) behaves as
  // expected on an ended span.
  t.is(span.transaction, trans, 'span.transaction');
  t.equal(span.name, 'theSpanName', 'span.name');
  t.equal(span.type, 'theSpanType', 'span.type');
  t.equal(span.subtype, 'theSpanSubtype', 'span.subtype');
  t.equal(span.action, 'theSpanAction', 'span.action');
  t.equal(
    span.traceparent,
    traceparentBefore,
    `span.traceparent: ${span.traceparent}`,
  );
  t.equal(span.outcome, 'success', 'span.outcome');
  t.equal(
    JSON.stringify(span.ids),
    JSON.stringify({ 'trace.id': span.traceId, 'span.id': span.id }),
    'span.ids',
  );
  t.deepLooseEqual(
    span.ids,
    { 'trace.id': traceId, 'span.id': spanId },
    'span.ids',
  );
  t.equal(
    span.toString(), // deprecated
    `trace.id=${traceId} span.id=${spanId}`,
    span.toString(),
  );

  // We just want to ensure that the Span API methods don't throw. Whether
  // they make span field changes after the span has ended isn't tested.
  span.setType('anotherSpanType', 'anotherSpanSubtype', 'anotherSpanAction');
  t.pass('span.setType(...) does not blow up');
  span.setLabel('aLabelKey', 'aLabelValue');
  t.pass('span.setLabel(...) does not blow up');
  span.addLabels({ anotherLabelKey: 'anotherLabelValue' });
  t.pass('span.addLabels(...) does not blow up');
  span.setOutcome('failure');
  t.pass('span.setOutcome(...) does not blow up');
  span.end(42);
  t.pass('span.end(...) does not blow up');

  trans.end();
  agent.flush(function () {
    t.end();
  });
});
