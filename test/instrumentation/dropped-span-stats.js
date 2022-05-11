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
const { DroppedSpanStats } = require('../../lib/instrumentation/dropped-span-stats')
const destinationContext = {
  service: {
    resource: 'foo'
  }
}
tape.test(function (suite) {
  suite.test('TODO: name me', function (test) {
    const droppedSpanStats = new DroppedSpanStats()
    agent.startTransaction('trans')
    const span = agent.startSpan('foo', 'baz', 'bar', { exitSpan: true })
    span.setDestinationContext(destinationContext)
    span.end()

    test.ok(
      droppedSpanStats.captureDroppedSpan(span)
    )

    test.equals(droppedSpanStats.statsMap.size, 1)

    console.log(droppedSpanStats.statsMap)
    test.end()
  })

  // test size of statsMap
  // test multiple keys
  // test with composite spans
  suite.end()
})
