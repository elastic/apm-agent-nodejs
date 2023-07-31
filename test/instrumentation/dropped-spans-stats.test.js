/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../..').start({
  serviceName: 'test-dropped-spans-stats',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: true,
  spanCompressionExactMatchMaxDuration: '60ms',
  spanCompressionSameKindMaxDuration: '50ms',
});

const { test } = require('tape');
const { OUTCOME_FAILURE, OUTCOME_SUCCESS } = require('../../lib/constants');
const {
  MAX_DROPPED_SPANS_STATS,
} = require('../../lib/instrumentation/dropped-spans-stats');

test('test DroppedSpansStats invalid cases', function (t) {
  const transaction = agent.startTransaction('trans');

  const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true });
  span.setOutcome(OUTCOME_SUCCESS);
  span.end();
  t.ok(transaction.captureDroppedSpan(span), 'captured dropped stats for span');

  t.ok(
    !transaction.captureDroppedSpan(null),
    'did not capture dropped stats for span=null',
  );

  const nonExitSpan = agent.startSpan('foo', 'baz', 'bar');
  nonExitSpan.setOutcome(OUTCOME_SUCCESS);
  nonExitSpan.end();
  t.ok(
    !transaction.captureDroppedSpan(nonExitSpan),
    'did not capture dropped stats for nonExitSpan',
  );

  transaction.end();
  t.end();
});

test('test DroppedSpansStats objects', function (t) {
  const transaction = agent.startTransaction('trans');
  for (let i = 0; i < 2; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', {
      exitSpan: true,
    });
    span.setOutcome(OUTCOME_SUCCESS);
    span.end();
    t.ok(transaction.captureDroppedSpan(span));
  }

  for (let i = 0; i < 3; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', {
      exitSpan: true,
    });
    span.setOutcome(OUTCOME_FAILURE);
    span.end();
    t.ok(transaction.captureDroppedSpan(span));
  }

  for (let i = 0; i < 4; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', {
      exitSpan: true,
    });
    span.setOutcome(OUTCOME_SUCCESS);
    span.setServiceTarget('aTargType', 'aTargName');
    span.end();
    span._duration = 1000.0001; // override duration so we can test the sum
    t.ok(transaction.captureDroppedSpan(span));
  }
  transaction.end();

  // three distinct resource/outcome pairs captured
  t.equals(transaction._droppedSpansStats.statsMap.size, 3);

  const payload = transaction._encode();
  const stats = payload.dropped_spans_stats;
  t.equals(stats[0].duration.count, 2);
  t.equals(stats[0].destination_service_resource, 'aSpanSubtype');
  t.equals(
    stats[0].service_target_type,
    'aSpanSubtype',
    'dropped_spans_stats[0].service_target_type',
  );
  t.equals(
    stats[0].service_target_name,
    undefined,
    'dropped_spans_stats[0].service_target_name',
  );
  t.equals(stats[0].outcome, OUTCOME_SUCCESS, 'dropped_spans_stats[0].outcome');

  t.equals(stats[1].duration.count, 3);
  t.equals(stats[1].destination_service_resource, 'aSpanSubtype');
  t.equals(
    stats[1].service_target_type,
    'aSpanSubtype',
    'dropped_spans_stats[1].service_target_type',
  );
  t.equals(
    stats[1].service_target_name,
    undefined,
    'dropped_spans_stats[1].service_target_name',
  );
  t.equals(stats[1].outcome, OUTCOME_FAILURE, 'dropped_spans_stats[1].outcome');

  t.equals(stats[2].duration.count, 4);
  t.equals(stats[2].destination_service_resource, 'aTargType/aTargName');
  t.ok(
    Number.isInteger(stats[2].duration.sum.us),
    'duration.sum.us is an integer (as required by intake API)',
  );
  t.equals(
    stats[2].duration.sum.us,
    4000000,
    'dropped_spans_stats[2].duration.sum.us',
  );
  t.equals(
    stats[2].service_target_type,
    'aTargType',
    'dropped_spans_stats[2].service_target_type',
  );
  t.equals(
    stats[2].service_target_name,
    'aTargName',
    'dropped_spans_stats[2].service_target_name',
  );
  t.equals(stats[2].outcome, OUTCOME_SUCCESS, 'dropped_spans_stats[2].outcome');

  t.end();
});

test('test DroppedSpansStats max items', function (t) {
  const transaction = agent.startTransaction('trans');
  for (let i = 0; i < MAX_DROPPED_SPANS_STATS; i++) {
    const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true });
    span.setServiceTarget('aTargType', 'aTargName-' + i);
    span.setOutcome(OUTCOME_FAILURE);
    span.end();
    t.ok(transaction.captureDroppedSpan(span));
  }

  // one too many
  const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true });
  span.setServiceTarget('aTargType', 'aTargName');
  span.setOutcome(OUTCOME_FAILURE);
  span.end();
  t.ok(
    !transaction.captureDroppedSpan(span),
    'did not capture stats for this dropped span (hit MAX_DROPPED_SPANS_STATS)',
  );

  // and we're still able to increment spans that fit the previous profile
  const span2 = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true });
  span2.setServiceTarget('aTargType', 'aTargName-' + 0);
  span2.setOutcome(OUTCOME_FAILURE);
  span2.end();
  t.ok(
    transaction.captureDroppedSpan(span2),
    'DID capture stats for this previously seen span stats key',
  );

  transaction.end();
  t.equals(
    transaction._droppedSpansStats.statsMap.size,
    MAX_DROPPED_SPANS_STATS,
  );
  t.end();
});
