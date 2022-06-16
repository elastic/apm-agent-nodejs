/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
const agent = require('../..').start({
  serviceName: 'test-span-stats',
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

const destinationContext = {
  service: {
    resource: 'foo'
  }
}
tape.test(function (suite) {
  suite.test('test DroppedSpanStats invalid cases', function (test) {
    const transaction = agent.startTransaction('trans')
    const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
    span.setDestinationContext(destinationContext)
    span.setOutcome(OUTCOME_SUCCESS)
    span.end()

    test.ok(transaction.captureDroppedSpan(span))

    test.ok(!transaction.captureDroppedSpan(null))

    span.setOutcome(OUTCOME_SUCCESS)
    span.setDestinationContext({
      service: {}
    })
    test.ok(!transaction.captureDroppedSpan(span))

    transaction.end()
    test.end()
  })

  suite.test('test DroppedSpanStats objects', function (test) {
    const transaction = agent.startTransaction('trans')
    for (let i = 0; i < 2; i++) {
      const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
      span.setDestinationContext(destinationContext)
      span.setOutcome(OUTCOME_SUCCESS)
      span.end()
      test.ok(
        transaction.captureDroppedSpan(span)
      )
    }

    for (let i = 0; i < 3; i++) {
      const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
      span.setDestinationContext(destinationContext)
      span.setOutcome(OUTCOME_FAILURE)
      span.end()
      test.ok(
        transaction.captureDroppedSpan(span)
      )
    }

    for (let i = 0; i < 4; i++) {
      const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
      span.setDestinationContext({
        service: {
          resource: 'bar'
        }
      })
      span.setOutcome(OUTCOME_SUCCESS)
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
    test.equals(stats[0].destination_service_resource, 'foo')
    test.equals(stats[0].outcome, OUTCOME_SUCCESS)

    test.equals(stats[1].duration.count, 3)
    test.equals(stats[1].destination_service_resource, 'foo')
    test.equals(stats[1].outcome, OUTCOME_FAILURE)

    test.equals(stats[2].duration.count, 4)
    test.equals(stats[2].destination_service_resource, 'bar')
    test.equals(stats[2].duration.sum.us, 4000000)
    test.equals(stats[2].outcome, OUTCOME_SUCCESS)

    test.end()
  })

  suite.test('test DroppedSpanStats max items', function (test) {
    const transaction = agent.startTransaction('trans')
    for (let i = 0; i < 128; i++) {
      const destinationContext = {
        service: {
          resource: 'foo' + i
        }
      }
      const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
      span.setDestinationContext(destinationContext)
      span.setOutcome(OUTCOME_FAILURE)
      span.end()
      test.ok(transaction.captureDroppedSpan(span))
    }

    // one too many
    const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
    span.setDestinationContext(destinationContext)
    span.setOutcome(OUTCOME_FAILURE)
    span.end()
    test.ok(!transaction.captureDroppedSpan(span))

    // and we're still able to increment spans that fit the previous profile
    const span2 = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
    span2.setDestinationContext({
      service: {
        resource: 'foo0'
      }
    })
    span2.setOutcome(OUTCOME_FAILURE)
    span2.end()
    test.ok(transaction.captureDroppedSpan(span2))

    transaction.end()
    test.equals(transaction._droppedSpanStats.statsMap.size, 128)
    test.end()
  })

  suite.end()
})
