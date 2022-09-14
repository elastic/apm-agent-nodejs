/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
const agent = require('../..').start({
  serviceName: 'test-dropped-span-stats',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: true,
  spanCompressionExactMatchMaxDuration: '60ms',
  spanCompressionSameKindMaxDuration: '50ms'
})

const tape = require('tape')
const { OUTCOME_FAILURE, OUTCOME_SUCCESS } = require('../../lib/constants')
const { MAX_DROPPED_SPAN_STATS } = require('../../lib/instrumentation/dropped-span-stats')

tape.test('test DroppedSpanStats invalid cases', function (test) {
  const transaction = agent.startTransaction('trans')

  const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
  span.setOutcome(OUTCOME_SUCCESS)
  span.end()
  test.ok(transaction.captureDroppedSpan(span), 'captured dropped stats for span')

  test.ok(!transaction.captureDroppedSpan(null), 'did not capture dropped stats for span=null')

  const nonExitSpan = agent.startSpan('foo', 'baz', 'bar')
  nonExitSpan.setOutcome(OUTCOME_SUCCESS)
  nonExitSpan.end()
  test.ok(!transaction.captureDroppedSpan(nonExitSpan), 'did not capture dropped stats for nonExitSpan')

  transaction.end()
  test.end()
})

tape.test('test DroppedSpanStats objects', function (test) {
  const transaction = agent.startTransaction('trans')
  for (let i = 0; i < 2; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', { exitSpan: true })
    span.setOutcome(OUTCOME_SUCCESS)
    span.end()
    test.ok(
      transaction.captureDroppedSpan(span)
    )
  }

  for (let i = 0; i < 3; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', { exitSpan: true })
    span.setOutcome(OUTCOME_FAILURE)
    span.end()
    test.ok(
      transaction.captureDroppedSpan(span)
    )
  }

  for (let i = 0; i < 4; i++) {
    const span = agent.startSpan('aSpanName', 'aSpanType', 'aSpanSubtype', { exitSpan: true })
    span.setOutcome(OUTCOME_SUCCESS)
    span.setServiceTarget('aTargType', 'aTargName')
    span.end()
    span._duration = 1000 // override duration so we can test the sum
    test.ok(
      transaction.captureDroppedSpan(span)
    )
  }
  transaction.end()

  // three distinct resource/outcome pairs captured
  test.equals(transaction._droppedSpanStats.statsMap.size, 3)

  const payload = transaction._encode()
  const stats = payload.dropped_spans_stats
  test.equals(stats[0].duration.count, 2)
  test.equals(stats[0].destination_service_resource, 'aSpanSubtype')
  test.equals(stats[0].service_target_type, 'aSpanSubtype', 'dropped_span_stats[0].service_target_type')
  test.equals(stats[0].service_target_name, undefined, 'dropped_span_stats[0].service_target_name')
  test.equals(stats[0].outcome, OUTCOME_SUCCESS, 'dropped_span_stats[0].outcome')

  test.equals(stats[1].duration.count, 3)
  test.equals(stats[1].destination_service_resource, 'aSpanSubtype')
  test.equals(stats[1].service_target_type, 'aSpanSubtype', 'dropped_span_stats[1].service_target_type')
  test.equals(stats[1].service_target_name, undefined, 'dropped_span_stats[1].service_target_name')
  test.equals(stats[1].outcome, OUTCOME_FAILURE, 'dropped_span_stats[1].outcome')

  test.equals(stats[2].duration.count, 4)
  test.equals(stats[2].destination_service_resource, 'aTargType/aTargName')
  test.equals(stats[2].duration.sum.us, 4000000)
  test.equals(stats[2].service_target_type, 'aTargType', 'dropped_span_stats[2].service_target_type')
  test.equals(stats[2].service_target_name, 'aTargName', 'dropped_span_stats[2].service_target_name')
  test.equals(stats[2].outcome, OUTCOME_SUCCESS, 'dropped_span_stats[2].outcome')

  test.end()
})

tape.test('test DroppedSpanStats max items', function (test) {
  const transaction = agent.startTransaction('trans')
  for (let i = 0; i < MAX_DROPPED_SPAN_STATS; i++) {
    const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
    span.setServiceTarget('aTargType', 'aTargName-' + i)
    span.setOutcome(OUTCOME_FAILURE)
    span.end()
    test.ok(transaction.captureDroppedSpan(span))
  }

  // one too many
  const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
  span.setServiceTarget('aTargType', 'aTargName')
  span.setOutcome(OUTCOME_FAILURE)
  span.end()
  test.ok(!transaction.captureDroppedSpan(span), 'did not capture stats for this dropped span (hit MAX_DROPPED_SPAN_STATS)')

  // and we're still able to increment spans that fit the previous profile
  const span2 = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
  span2.setServiceTarget('aTargType', 'aTargName-' + 0)
  span2.setOutcome(OUTCOME_FAILURE)
  span2.end()
  test.ok(transaction.captureDroppedSpan(span2), 'DID capture stats for this previously seen span stats key')

  transaction.end()
  test.equals(transaction._droppedSpanStats.statsMap.size, MAX_DROPPED_SPAN_STATS)
  test.end()
})
