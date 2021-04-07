agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  transactionSampleRate: 1
})

const suite = require('tape')

suite('Sample Rate Propagation', function (test) {
  const TRACEPARENT_RECORDED = '00-2b9e333caa56c38e6e4d682f3184da23-a6bea2be0b62fb54-01'
  const TRACEPARENT_NOTRECORDED = '00-c054b05d8262aaca165ed62e32898f55-4fcce7bf3ec36951-00';

  test.test('sample rate is set', function(t){
    agent._conf.transactionSampleRate = .499
    const transaction = agent.startTransaction('foo','bar','baz','bing',{
    })
    t.equals(transaction.sample_rate, .499, 'sample rate set')

    t.end()
  })

  test.test('prefers tracestate value', function(t){
    const transaction = agent.startTransaction('foo','bar','baz','bing',{
      childOf:TRACEPARENT_RECORDED,
      tracestate:'es=s:0.7654321'
    })
    t.equals(transaction.sample_rate, 0.7654321, 'sample rate set')
    t.end()
  })

  // test that a sampled/recorded transaction produces spans and transactions
  // with a sample_rate property equal to the sample rate
  test.test('recorded transactions have sample rate', function(t){
    const transaction = agent.startTransaction('foo','bar','baz','bing',{
      childOf:TRACEPARENT_RECORDED,
      tracestate:'es=s:0.7654321'
    })
    const span = transaction.startSpan('foo')
    t.equals(transaction.sample_rate, 0.7654321, 'sample rate set')
    t.equals(span.sample_rate, 0.7654321, 'sample rate set')
    t.end()
  })

  // test that a unsampled/unrecorded transaction produces a transaction
  // with a sample_rate property of 0, and produces no spans
  test.test('unrecorded transactions have a sample rate of 0', function(t){
    const transaction = agent.startTransaction('foo','bar','baz','bing',{
      childOf:TRACEPARENT_NOTRECORDED,
      tracestate:'es=s:0'
    })
    const span = transaction.startSpan('foo')
    t.equals(transaction.sample_rate, 0, 'sample rate set')
    t.ok(!span, 'span not started')
    t.end()
  })

  // test that a sampled/recorded root transaction produces samples and
  // transactions with a sample_rate equal to the sample rate
  test.test('recorded root transactions have a sample rate of 0', function(t){
    agent._conf.transactionSampleRate = 1
    const transaction = agent.startTransaction('foo','bar','baz','bing')
    const span = transaction.startSpan('foo')
    t.equals(transaction.sample_rate, 1, 'sample rate set')
    t.equals(span.sample_rate, 1, 'sample rate set')
    t.end()
  })

  // test that an unsampled/unrecorded root  transaction produces a transaction
  // with a sample_rate property of 0, and produces no spans
  test.test('recorded root transactions have a sample rate of 0', function(t){
    agent._conf.transactionSampleRate = 0
    const transaction = agent.startTransaction('foo','bar','baz','bing')
    const span = transaction.startSpan('foo')
    t.equals(transaction.sample_rate, 0, 'sample rate set')
    t.ok(!span, 'no span for unsampled transactions')
    t.end()
  })

  // test that an unsampled transaction from a non-zero sample rate
  // still produces a final serialized span with a sample rate of 0
  test.test('recorded root transactions have a sample rate of 0', function(t){
    agent._conf.transactionSampleRate = .1

    // sort of gross while shenanagins to let us get an unsampled
    // transaction with a non-zero sample rate
    let transaction = {sampled:true}
    while(transaction.sampled) {
      transaction = agent.startTransaction('foo','bar','baz','bing')
    }
    const span = transaction.startSpan('foo')
    const serialized = transaction.toJSON()
    t.equals(serialized.sample_rate, 0, 'serialized sample rate is zero')
    t.ok(!span, 'no span for unsampled transactions')
    t.end()
  })

  // Test that a blank tracestate -- does what?
  test.test('recorded transaction continuing with no tracestate', function(t){
    // sort of gross while shenanagins to let us get an unsampled
    // transaction with a non-zero sample rate
    const transaction = agent.startTransaction('foo','bar','baz','bing',{
      childOf:TRACEPARENT_RECORDED,
      tracestate:'dsvoihd'
    })

    const span = transaction.startSpan('foo')

    console.log(transaction.sample_rate)
    console.log(span.sample_rate)
    t.end()
  })

  // Test that an invalid tracestate -- does what?

  test.end()

})
