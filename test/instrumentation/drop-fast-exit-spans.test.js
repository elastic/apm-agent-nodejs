/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test `exitSpanMinDuration` handling.

const agent = require('../..').start({
  serviceName: 'test-fast-exit-span',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  exitSpanMinDuration: '200ms', // Use a large enough value to not get surprised by event-loop delay on busy CI VMs.
});
const Transaction = require('../../lib/instrumentation/transaction');
const Span = require('../../lib/instrumentation/span');
const { OUTCOME_FAILURE } = require('../../lib/constants');
const mockClient = require('../_mock_http_client');
const tape = require('tape');

tape.test('discardable tests', function (t) {
  const trans = new Transaction(agent);
  const spanDefault = new Span(trans, 'foo', 'bar');
  t.equals(
    spanDefault.discardable,
    false,
    'spans are not discardable by default',
  );

  const spanExit = new Span(trans, 'foo', 'bar', { exitSpan: true });
  t.equals(spanExit.discardable, true, 'exit spans are discardable');

  const spanOutcome = new Span(trans, 'foo', 'bar', { exitSpan: true });
  t.equals(spanOutcome.discardable, true, 'exit spans are discardable');
  spanOutcome.setOutcome(OUTCOME_FAILURE);
  t.equals(spanOutcome.discardable, false, 'failed spans are not discardable');

  const spanPropagation = new Span(trans, 'foo', 'bar', { exitSpan: true });
  t.equals(spanPropagation.discardable, true, 'exit spans are discardable');

  const newHeaders = {};
  spanPropagation.propagateTraceContextHeaders(
    newHeaders,
    function (carrier, name, value) {
      carrier[name] = value;
    },
  );
  t.equals(
    spanPropagation.discardable,
    false,
    'spans with propagated context are not discardable',
  );
  t.end();
});

tape.test('end to end test', function (t) {
  resetAgent(function (data) {
    t.equals(data.length, 2);
    const span = data.spans.pop();
    t.equals(
      span.name,
      'long span',
      `the long span was not dropped (duration ${span.duration}ms > ${
        agent._conf.exitSpanMinDuration * 1000
      }ms) was not dropped`,
    );
    t.end();
  });

  agent.startTransaction('test');
  const span1 = agent.startSpan('short span', 'type', 'subtype', 'action', {
    exitSpan: true,
  });
  span1.end(); // almost immediate, shorter than exitSpanMinDuration

  const span2 = agent.startSpan('long span', 'type', 'subtype', 'action', {
    exitSpan: true,
  });
  setTimeout(function () {
    span2.end();
    agent.endTransaction();
    agent.flush();
  }, 300); // longer than exitSpanMinDuration
});

// Test that a composite span faster than `exitSpanMinDuration` is dropped.
tape.test('end to end test with compression', function (t) {
  resetAgent(function (data) {
    t.equals(
      data.spans.length,
      0,
      `the composite span was dropped (exitSpanMinDuration=${
        agent._conf.exitSpanMinDuration * 1000
      }ms, data.spans=${JSON.stringify(data.spans)})`,
    );
    t.end();
  });

  agent.startTransaction('test');
  let firstSpan, finalSpan;
  setTimeout(function () {
    firstSpan = agent.startSpan('name1', 'db', 'mysql', { exitSpan: true });
    setTimeout(function () {
      firstSpan.end();
    }, 1);
  }, 1);

  setTimeout(function () {
    const span = agent.startSpan('name1', 'db', 'mysql', { exitSpan: true });
    setTimeout(function () {
      span.end();
    }, 1);
  }, 2);

  setTimeout(function () {
    finalSpan = agent.startSpan('name1', 'db', 'mysql', { exitSpan: true });
    setTimeout(function () {
      finalSpan.end();
      agent.endTransaction();
      agent.flush();
    }, 1);
  }, 3);
});

function resetAgent(/* numExpected, */ cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(/* numExpected, */ cb);
  agent.captureError = function (err) {
    throw err;
  };
}
