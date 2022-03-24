'use strict'
const agent = require('../..').start({
  serviceName: 'test-span-buffering',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: true,
  spanCompressionExactMatchMaxDuration: '60ms',
  spanCompressionSameKindMaxDuration: '50ms'
})
const Transaction = require('../../lib/instrumentation/transaction')
const Span = require('../../lib/instrumentation/span')
const { SpanCompression, constants } = require('../../lib/instrumentation/span-compression')

const mockClient = require('../_mock_http_client')

const tape = require('tape')

tape.test('TODO: name basic integration test(s)', function (suite) {
  suite.test('TODO: name this test', function (t) {
    resetAgent(function (data) {
      t.equals(data.length, 2, 'one transation, one span (other spans compressed)')
      const span = data.spans.shift()
      t.equals(span.name, 'name1')
      t.equals(span.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH)
      t.equals(span.composite.count, 3)
      t.true(span.composite.sum > 30)
      t.equals(span.duration, (finalSpan._endTimestamp - firstSpan.timestamp) / 1000)
      t.end()
    })

    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }

    agent.startTransaction(agent)

    let firstSpan, finalSpan
    setTimeout(function () {
      firstSpan = agent.startSpan('name1', 'db', 'mysql')
      firstSpan.setDestinationContext(destinationContext)
      setTimeout(function () {
        firstSpan.end()
      }, 10)
    }, 10)

    setTimeout(function () {
      const span = agent.startSpan('name1', 'db', 'mysql')
      span.setDestinationContext(destinationContext)
      setTimeout(function () {
        span.end()
      }, 10)
    }, 20)

    setTimeout(function () {
      finalSpan = agent.startSpan('name1', 'db', 'mysql')
      finalSpan.setDestinationContext(destinationContext)
      setTimeout(function () {
        finalSpan.end()
        agent.endTransaction()
        agent.flush()
      }, 10)
    }, 30)
  })
  suite.end()
})

tape.test('test _getCompressionStrategy', function (suite) {
  suite.test('test invalid', function (t) {
    const c = new SpanCompression(agent)
    t.equals(false, c._getCompressionStrategy({}, {}), 'invalid objects return false')
    t.end()
  })

  suite.test('test exact match', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name', 'type', 'subtype')
    const span2 = new Span(trans, 'name', 'type', 'subtype')
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }
    span1.setDestinationContext(destinationContext)
    span2.setDestinationContext(destinationContext)

    t.equals(constants.STRATEGY_EXACT_MATCH, c._getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test same kind', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name1', 'type', 'subtype')
    const span2 = new Span(trans, 'name2', 'type', 'subtype')
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }
    span1.setDestinationContext(destinationContext)
    span2.setDestinationContext(destinationContext)

    t.equals(constants.STRATEGY_SAME_KIND, c._getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test no strat', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name1', 'type2', 'subtype')
    const span2 = new Span(trans, 'name2', 'type', 'subtype')
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }
    span1.setDestinationContext(destinationContext)
    span2.setDestinationContext(destinationContext)

    t.equals(false, c._getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test _isEnabled', function (t) {
    const mockedAgentDisabled = {
      _conf: {
        spanCompressionEnabled: false
      }
    }
    const mockedAgentEnabled = {
      _conf: {
        spanCompressionEnabled: true
      }
    }
    const cDisabled = new SpanCompression(mockedAgentDisabled)
    t.ok(!cDisabled._isEnabled(), '_isEnabled returns false when feature disabled')

    const cEnabled = new SpanCompression(mockedAgentEnabled)
    t.ok(cEnabled._isEnabled(), '_isEnabled returns true when feature enabled')

    t.end()
  })

  suite.test('TODO: name tryToCompress exact match', function (t) {
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name', 'type', 'mysql')
    span1.setDestinationContext(destinationContext)
    span1._duration = 2 // time in milliseconds/ms

    const span2 = new Span(trans, 'name', 'type', 'mysql')
    span2.setDestinationContext(destinationContext)
    span2._endTimestamp = span1.timestamp + 5000 // time in microseconds/us
    span2._duration = 3 // time in milliseconds/ms

    const span3 = new Span(trans, 'name', 'type', 'mysql')
    span3.setDestinationContext(destinationContext)
    span3._endTimestamp = span2._endTimestamp + 4000 // time in microseconds/us
    span3._duration = 4 // time in milliseconds/ms

    const spanSameKind = new Span(trans, 'name 2', 'type', 'mysql')
    spanSameKind.setDestinationContext(destinationContext)
    spanSameKind._endTimestamp = span3._endTimestamp + 3000 // time in microseconds/us
    spanSameKind._duration = 2 // time in milliseconds/ms

    t.ok(c.tryToCompress(span1, span2), 'tryToCompress returns true')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH, 'exact match set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 5000, 'duration is the timestamp difference')

    t.equals(c.composite.sum, 5, 'sum is the combined durations')

    t.ok(c.tryToCompress(span1, span3), 'tryToCompress returns true')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH, 'exact match set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9000, 'duration is the timestamp difference')
    t.equals(c.composite.sum, 9, 'sum is the combined durations')

    t.ok(!c.tryToCompress(span1, spanSameKind), 'tryToCompress fails since same is not exact match')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH, 'exact match set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9000, 'duration stays constant with last value')
    t.equals(c.composite.sum, 9, 'sum stays constant with last value')
    t.end()
  })

  suite.test('TODO: name tryToCompress same kind', function (t) {
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name 1', 'type', 'mysql')
    span1.setDestinationContext(destinationContext)
    span1._duration = 2 // time in milliseconds/ms

    const span2 = new Span(trans, 'name 2', 'type', 'mysql')
    span2.setDestinationContext(destinationContext)
    span2._endTimestamp = span1.timestamp + 5000 // time in microseconds/us
    span2._duration = 3 // time in milliseconds/ms

    // span three is set to be an "exact match" of span 2 in order
    // to ensure the strategy stays same kind
    const span3 = new Span(trans, 'name 2', 'type', 'mysql')
    span3.setDestinationContext(destinationContext)
    span3._endTimestamp = span2._endTimestamp + 4000 // time in microseconds/us
    span3._duration = 4 // time in milliseconds/ms

    const spanNotSameKind = new Span(trans, 'name 4', 'type', 'other')
    spanNotSameKind.setDestinationContext(destinationContext)
    spanNotSameKind._endTimestamp = span3._endTimestamp + 3000 // time in microseconds/us
    spanNotSameKind._duration = 2 // time in milliseconds/ms

    t.ok(c.tryToCompress(span1, span2), 'tryToCompress returns true')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND, 'same kind set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 5000, 'duration is the timestamp difference')
    t.equals(c.composite.sum, 5, 'sum is the combined durations')

    t.ok(c.tryToCompress(span1, span3), 'tryToCompress returns true')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND, 'same kind set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9000, 'duration is the timestamp difference')
    t.equals(c.composite.sum, 9, 'sum is the combined durations')

    t.ok(!c.tryToCompress(span1, spanNotSameKind), 'tryToCompress fails since span is not same kind')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND, 'same kind set')
    t.equals(c.composite.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9000, 'duration stays constant with last value')
    t.equals(c.composite.sum, 9, 'sum stays constant with last value')
    t.end()
  })

  suite.test('tryToCompress exact match, max duration', function (t) {
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span = new Span(trans, 'name', 'type', 'mysql')
    span.setDestinationContext(destinationContext)
    span._duration = 20 // time in milliseconds/ms

    const spanOver = new Span(trans, 'name', 'type', 'mysql')
    spanOver.setDestinationContext(destinationContext)
    spanOver._duration = 40 // time in milliseconds/ms

    const spanUnder = new Span(trans, 'name', 'type', 'mysql')
    spanUnder.setDestinationContext(destinationContext)
    spanUnder._duration = 39 // time in milliseconds/ms

    const spanBrokeCamelsBack = new Span(trans, 'name', 'type', 'mysql')
    spanBrokeCamelsBack.setDestinationContext(destinationContext)
    spanBrokeCamelsBack._duration = 1 // time in milliseconds/ms

    t.ok(!c.tryToCompress(span, spanOver), '60ms is >= spanCompressionExactMatchMaxDuration')

    t.ok(c.tryToCompress(span, spanUnder), '59ms is < spanCompressionExactMatchMaxDuration')
    t.ok(!c.tryToCompress(span, spanBrokeCamelsBack), '60ms is < spanCompressionExactMatchMaxDuration')
    t.end()
  })

  suite.test('tryToCompress same kind, max duration', function (t) {
    const destinationContext = {
      service: {
        resource: 'foo'
      }
    }

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span = new Span(trans, 'name', 'type', 'mysql')
    span.setDestinationContext(destinationContext)
    span._duration = 20 // time in milliseconds/ms

    const spanOver = new Span(trans, 'name 2', 'type', 'mysql')
    spanOver.setDestinationContext(destinationContext)
    spanOver._duration = 30 // time in milliseconds/ms

    const spanUnder = new Span(trans, 'name 2', 'type', 'mysql')
    spanUnder.setDestinationContext(destinationContext)
    spanUnder._duration = 29 // time in milliseconds/ms

    const spanBrokeCamelsBack = new Span(trans, 'name 2', 'type', 'mysql')
    spanBrokeCamelsBack.setDestinationContext(destinationContext)
    spanBrokeCamelsBack._duration = 1 // time in milliseconds/ms

    t.ok(!c.tryToCompress(span, spanOver), '50ms is >= spanCompressionSameKindMaxDuration')

    t.ok(c.tryToCompress(span, spanUnder), '49ms is < spanCompressionSameKindMaxDuration')
    t.ok(!c.tryToCompress(span, spanBrokeCamelsBack), '50ms is < spanCompressionSameKindMaxDuration')
    t.end()
  })
})

function resetAgent (/* numExpected, */ cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(/* numExpected, */ cb)
  agent.captureError = function (err) { throw err }
}
