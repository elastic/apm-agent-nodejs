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

const destinationContext = {
  service: {
    resource: 'foo'
  }
}

tape.test('integration/end-to-end span compression tests', function (suite) {
  suite.test('exact match compression', function (t) {
    resetAgent(function (data) {
      t.equals(data.length, 2)
      const span = data.spans.shift()
      t.equals(span.name, 'name1')
      t.equals(span.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH)
      t.equals(span.composite.count, 3)
      if (!(span.composite.sum > 30)) {
        console.log(span.composite)
        process.exit(1)
      }
      t.true(span.composite.sum > 30)
      t.equals(span.duration, (finalSpan._endTimestamp - firstSpan.timestamp) / 1000)
      t.end()
    })

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

  suite.test('same kind compression', function (t) {
    resetAgent(function (data) {
      t.equals(data.length, 2)
      const span = data.spans.shift()
      t.equals(span.name, 'Calls to foo')
      t.equals(span.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
      t.equals(span.composite.count, 3)
      t.true(span.composite.sum > 30)
      t.equals(span.duration, (finalSpan._endTimestamp - firstSpan.timestamp) / 1000)
      t.end()
    })

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
      const span = agent.startSpan('name2', 'db', 'mysql')
      span.setDestinationContext(destinationContext)
      setTimeout(function () {
        span.end()
      }, 10)
    }, 20)

    setTimeout(function () {
      finalSpan = agent.startSpan('name3', 'db', 'mysql')
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

tape.test('unit tests', function (suite) {
  suite.test('test _getCompressionStrategy invalid', function (t) {
    const c = new SpanCompression(agent)
    t.equals(false, c._getCompressionStrategy({}, {}))
    t.end()
  })

  suite.test('test _getCompressionStrategy exact match', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name', 'type', 'subtype')
    const span2 = new Span(trans, 'name', 'type', 'subtype')

    span1.setDestinationContext(destinationContext)
    span2.setDestinationContext(destinationContext)

    t.equals(constants.STRATEGY_EXACT_MATCH, c._getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test _getCompressionStrategy same kind', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name1', 'type', 'subtype')
    const span2 = new Span(trans, 'name2', 'type', 'subtype')

    span1.setDestinationContext(destinationContext)
    span2.setDestinationContext(destinationContext)

    t.equals(constants.STRATEGY_SAME_KIND, c._getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test _getCompressionStrategy no strategy', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name1', 'type2', 'subtype')
    const span2 = new Span(trans, 'name2', 'type', 'subtype')

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

  suite.test('test tryToCompress exact match', function (t) {
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

    t.ok(c.tryToCompress(span1, span2))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 5, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 5, 'sum is the combined durations')

    t.ok(c.tryToCompress(span1, span3))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 9, 'sum is the combined durations')

    t.ok(!c.tryToCompress(span1, spanSameKind), 'tryToCompress fails since span is not exact match')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_EXACT_MATCH)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9, 'duration stays constant with last value')
    t.equals(c.composite.sum, 9, 'sum stays constant with last value')
    t.end()
  })

  suite.test('test tryToCompress same kind', function (t) {
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

    t.ok(c.tryToCompress(span1, span2))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 5, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 5, 'sum is the combined durations')

    t.ok(c.tryToCompress(span1, span3))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 9, 'sum is the combined durations')

    t.ok(!c.tryToCompress(span1, spanNotSameKind), 'tryToCompress fails since span is not same kind')
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9, 'duration stays constant with last value')
    t.equals(c.composite.sum, 9, 'sum stays constant with last value')
    t.end()
  })

  suite.test('test tryToCompress same kind, then exact match', function (t) {
    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span1 = new Span(trans, 'name 1', 'type', 'mysql')
    span1.setDestinationContext(destinationContext)
    span1._duration = 2 // time in milliseconds/ms

    const span2 = new Span(trans, 'name 2', 'type', 'mysql')
    span2.setDestinationContext(destinationContext)
    span2._endTimestamp = span1.timestamp + 5000 // time in microseconds/us
    span2._duration = 3 // time in milliseconds/ms

    // span three is set to be an "exact match" of span 1 in order
    // to ensure the strategy stays same kind
    const span3 = new Span(trans, 'name 1', 'type', 'mysql')
    span3.setDestinationContext(destinationContext)
    span3._endTimestamp = span2._endTimestamp + 4000 // time in microseconds/us
    span3._duration = 4 // time in milliseconds/ms

    t.ok(c.tryToCompress(span1, span2))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 5, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 5, 'sum is the combined durations')

    t.ok(c.tryToCompress(span1, span3))
    t.equals(c.composite.compression_strategy, constants.STRATEGY_SAME_KIND)
    t.equals(c.timestamp, span1.timestamp, 'timestamp is composite span\'s timestamp')
    t.equals(c.duration, 9, 'duration is the start/end timestamp difference in miliseconds')
    t.equals(c.composite.sum, 9, 'sum is the combined durations')

    t.end()
  })

  suite.test('test tryToCompress exact match max duration', function (t) {
    // presumes agent configuration is
    // spanCompressionExactMatchMaxDuration: '60ms',
    // spanCompressionSameKindMaxDuration: '50ms'

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span = new Span(trans, 'name', 'type', 'mysql')
    span.setDestinationContext(destinationContext)
    span._duration = 20 // time in milliseconds/ms

    const spanOver = new Span(trans, 'name', 'type', 'mysql')
    spanOver.setDestinationContext(destinationContext)
    spanOver._duration = 61 // time in milliseconds/ms

    const spanUnder = new Span(trans, 'name', 'type', 'mysql')
    spanUnder.setDestinationContext(destinationContext)
    spanUnder._duration = 60 // time in milliseconds/ms

    t.ok(!c.tryToCompress(span, spanOver), '61ms is > spanCompressionExactMatchMaxDuration')
    t.ok(c.tryToCompress(span, spanUnder), '60ms is =< spanCompressionExactMatchMaxDuration')

    t.end()
  })

  suite.test('test tryToCompress same kind max duration', function (t) {
    // presumes agent configuration is
    // spanCompressionExactMatchMaxDuration: '60ms',
    // spanCompressionSameKindMaxDuration: '50ms'

    const c = new SpanCompression(agent)
    const trans = new Transaction(agent)
    const span = new Span(trans, 'name', 'type', 'mysql')
    span.setDestinationContext(destinationContext)
    span._duration = 20 // time in milliseconds/ms

    const spanOver = new Span(trans, 'name 2', 'type', 'mysql')
    spanOver.setDestinationContext(destinationContext)
    spanOver._duration = 51 // time in milliseconds/ms

    const spanUnder = new Span(trans, 'name 2', 'type', 'mysql')
    spanUnder.setDestinationContext(destinationContext)
    spanUnder._duration = 50 // time in milliseconds/ms

    t.ok(!c.tryToCompress(span, spanOver), '51ms is > spanCompressionSameKindMaxDuration')
    t.ok(c.tryToCompress(span, spanUnder), '50ms is =< spanCompressionSameKindMaxDuration')
    t.end()
  })
})

function resetAgent (/* numExpected, */ cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(/* numExpected, */ cb)
  agent.captureError = function (err) { throw err }
}
