var test = require('tape')
test('Sample Rate Propagation', function (t) {
  // create a transaction with a traceparent and tracestate

  // use trasaction to start a span

  // serialize each

  // test that sample_rate is set, and matches the original sample rate
  // from the tracestate

  // test that an unsampled transaction produces no spans, and has a
  // sample_rate of 0

  // test that a tracestate without an s produces spans and transactions
  // without a sample_rate property

  // What about an unsample transaction without a tracestate?
  t.ok(false)

})
