const agent = require('../..').start({
  serviceName: 'test-span-buffering',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none'
})
const Transaction = require('../../lib/instrumentation/transaction')
const Span = require('../../lib/instrumentation/span')
const {SpanCompression, constants} = require('../../lib/instrumentation/span-compression')

const mockClient = require('../_mock_http_client')

const tape = require('tape')
tape.test('TODO: name basic integration test(s)',function(suite) {
  suite.test(function(t){
    resetAgent(function(data){
      t.equals(data.length, 3)
      t.end()
    })
    agent.startTransaction('test transaction')
    const span1 = agent.startSpan('test span 1')
    const span2 = agent.startSpan('test span 2')
    span2.end()
    span1.end()
    agent.endTransaction()
    agent.flush()
  })
  suite.end()
})

tape.test('test getCompressionStrategy', function(suite){
  suite.test('test invalid', function(t){
    const c = new SpanCompression
    t.equals(false, c.getCompressionStrategy({}, {}), 'invalid objects return false')
    t.end()
  })

  suite.test('test exact match', function(t){
    const c = new SpanCompression
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

    t.equals(constants.STRATEGY_EXACT_MATCH, c.getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test same kind', function(t){
    const c = new SpanCompression
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

    t.equals(constants.STRATEGY_SAME_KIND, c.getCompressionStrategy(span1, span2))
    t.end()
  })

  suite.test('test no strat', function(t){
    const c = new SpanCompression
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

    t.equals(false, c.getCompressionStrategy(span1, span2))
    t.end()
  })

  // test tryToCompress
  // test same kind
    // first call
    // second call
    // third call with a non compressible span
  // test exact match
    // first call
    // second call
    // third call with a non compressible span
})

function resetAgent (/*numExpected,*/ cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(/*numExpected,*/ cb)
  agent.captureError = function (err) { throw err }
}
