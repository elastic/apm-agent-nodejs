'use strict'

const test = require('tape')

const Agent = require('../../lib/agent')
const { CapturingTransport } = require('../_capturing_transport')

const basicMetrics = [
  'system.cpu.total.norm.pct',
  'system.memory.total',
  'system.memory.actual.free',
  'system.process.cpu.total.norm.pct',
  'system.process.cpu.system.norm.pct',
  'system.process.cpu.user.norm.pct',
  'system.process.memory.rss.bytes',
  'nodejs.handles.active',
  'nodejs.requests.active',
  'nodejs.memory.heap.allocated.bytes',
  'nodejs.memory.heap.used.bytes',
  'nodejs.eventloop.delay.avg.ms'
]

if (process.platform === 'linux') {
  basicMetrics.push('system.process.memory.size')
}

const spanMetrics = [
  'span.self_time.count',
  'span.self_time.sum.us'
]

const metrics = {
  transaction: [
    'transaction.duration.count',
    'transaction.duration.sum.us',
    'transaction.breakdown.count'
  ],
  'transaction span': spanMetrics,
  span: spanMetrics,
  'transaction not sampling': [
    'transaction.duration.count',
    'transaction.duration.sum.us'
  ]
}

function nullableEqual (a, b) {
  return (!a && !b) || a === b
}

const finders = {
  transaction (metricsets) {
    return metricsets.find(metricset => metricset.transaction && !metricset.span)
  },
  'transaction span' (metricsets) {
    return metricsets.find(metricset => metricset.span && metricset.span.type === 'app')
  },
  span (metricsets, span) {
    return metricsets.find(metricset => {
      if (!metricset.span) return false
      const { type, subtype } = metricset.span
      if (!nullableEqual(type, span.type)) return false
      if (!nullableEqual(subtype, span.subtype)) return false
      return true
    })
  },
  'transaction not sampling' (metricsets) {
    return metricsets.find(metricset => metricset.transaction && !metricset.span)
  }
}

const expectations = {
  transaction (transaction) {
    return {
      transaction: {
        name: transaction.name,
        type: transaction.type
      }
    }
  },
  'transaction span' (transaction) {
    return Object.assign(this.transaction(transaction), {
      span: {
        type: 'app'
      }
    })
  },
  span (transaction, span) {
    return Object.assign(this.transaction(transaction), {
      span: {
        type: span.type
      }
    })
  },
  'transaction not sampling' (transaction) {
    return {
      transaction: {
        name: transaction.name,
        type: transaction.type
      }
    }
  }
}

// Use 1s, the shortest enabled metrics interval allowed, so tests waiting for
// metrics to be reported need only wait this long. The agent has no mechanism
// to "flush/send metrics now".
const testMetricsInterval = '1s'
const testMetricsIntervalMs = 1000
const testAgentOpts = {
  serviceName: 'test-breakdown-metrics',
  cloudProvider: 'none',
  centralConfig: false,
  captureExceptions: false,
  captureSpanStackTraces: false,
  // Create a transport that captures all sent events for later asserts.
  transport () {
    return new CapturingTransport()
  },
  metricsInterval: testMetricsInterval
}

test('includes breakdown when sampling', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar')
  var span = agent.startSpan('s0 name', 's0 type')
  if (span) span.end()
  transaction.end()

  // Wait for the following before test asserts:
  // (a) the encode and sendSpan of any spans, and
  // (b) breakdown metrics to be sent.
  //
  // If the above transactions/spans are all created and ended *synchronously*
  // then *often* these are ready "soon" (within a setImmediate) -- but relying
  // on that is a race. If the above transactions/spans are *asynchronous*, then
  // the breakdown metrics will not be available until the next metricsInterval.
  // We wait for that.
  setTimeout(function () {
    const data = agent._transport
    t.strictEqual(data.transactions.length, 1, 'has one transaction')
    assertTransaction(t, transaction, data.transactions[0])

    t.strictEqual(data.spans.length, 1, 'has one span')
    assertSpan(t, span, data.spans[0])

    const { metricsets } = data
    assertMetricSet(t, 'transaction', metricsets, {
      transaction
    })
    assertMetricSet(t, 'span', metricsets, {
      transaction,
      span
    })
    assertMetricSet(t, 'transaction span', metricsets, {
      transaction,
      span
    })

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('does not include breakdown when not sampling', t => {
  const agent = new Agent().start(Object.assign(
    {},
    testAgentOpts,
    { transactionSampleRate: 0 }
  ))

  var transaction = agent.startTransaction('foo', 'bar')
  var span = agent.startSpan('s0 name', 's0 type')
  if (span) span.end()
  transaction.end()

  // See "Wait" comment above.
  setTimeout(function () {
    const data = agent._transport
    t.strictEqual(data.transactions.length, 1, 'has one transaction')
    assertTransaction(t, transaction, data.transactions[0])

    t.strictEqual(data.spans.length, 0, 'has no spans')

    const { metricsets } = data
    assertMetricSet(t, 'transaction not sampling', metricsets, {
      transaction
    })
    t.comment('metricSet - span')
    t.notOk(metricsets.find(metricset => !!metricset.span), 'should not have any span metricsets')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('does not include transaction breakdown when disabled', t => {
  const agent = new Agent().start(Object.assign(
    {},
    testAgentOpts,
    {
      transactionSampleRate: 0,
      breakdownMetrics: false
    }
  ))

  var transaction = agent.startTransaction('foo', 'bar')
  var span = agent.startSpan('s0 name', 's0 type')
  if (span) span.end()
  transaction.end()

  // See "Wait" comment above.
  setTimeout(function () {
    const data = agent._transport
    t.strictEqual(data.transactions.length, 1, 'has one transaction')
    assertTransaction(t, transaction, data.transactions[0])

    t.strictEqual(data.spans.length, 0, 'has no spans')

    const { metricsets } = data
    t.comment('metricSet - transaction metrics')
    const metricSet = finders.transaction(metricsets, span)
    t.ok(metricSet, 'found metricset')
    assertMetricSetKeys(t, metricSet, [
      'transaction.duration.count',
      'transaction.duration.sum.us'
    ])
    assertMetricSetData(t, metricSet, expectations.transaction(transaction, span))
    t.comment('metricSet - span')
    t.notOk(metricsets.find(metricset => !!metricset.span), 'should not have any span metricsets')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('only transaction', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 30 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with single sub-span', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span = agent.startSpan('SELECT *', 'db.mysql', { startTime: 10 })
  if (span) span.end(20)
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets, span),
      transaction_span: finders['transaction span'](metricsets, span),
      span: finders.span(metricsets, span)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with single app sub-span', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span = agent.startSpan('foo', 'app', { startTime: 10 })
  if (span) span.end(20)
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets, span),
      transaction_span: finders['transaction span'](metricsets, span),
      span: finders.span(metricsets, span)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 30 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with parallel sub-spans', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0
  setImmediate(function () {
    span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 })
    setImmediate(function () {
      if (span0) span0.end(20)
    })
  })
  setImmediate(function () {
    var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 10 })
    setImmediate(function () {
      if (span1) span1.end(20)
      transaction.end(null, 30)
      agent.flush()
    })
  })

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets),
      span: finders.span(metricsets, span0)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with overlapping sub-spans', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0
  setImmediate(function () {
    span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 })
    setImmediate(function () {
      if (span0) span0.end(20)
    })
  })
  setImmediate(function () {
    var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 15 })
    setImmediate(function () {
      if (span1) span1.end(25)
      setImmediate(function () {
        transaction.end(null, 30)
      })
    })
  })

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets),
      span: finders.span(metricsets, span0)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 15 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with sequential sub-spans', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 5 })
  if (span0) span0.end(15)
  var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 15 })
  if (span1) span1.end(25)
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets),
      span: finders.span(metricsets, span0)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with sub-spans returning to app time', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 })
  if (span0) span0.end(15)
  var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 20 })
  if (span1) span1.end(25)
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets),
      span: finders.span(metricsets, span0)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 20 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with overlapping nested async sub-spans', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0 = agent.startSpan('foo', 'app', { startTime: 10 })
  var span1 = agent.startSpan('SELECT *', 'db.mysql', { startTime: 15, childOf: span0 })
  if (span0) span0.end(20)
  if (span1) span1.end(25)
  transaction.end(null, 30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets),
      span: finders.span(metricsets, span1)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 30 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 2 },
      'span.self_time.sum.us': { value: 25 }
    }, 'sample values match')

    t.ok(found.span, 'found db.mysql span metricset')
    t.deepEqual(found.span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with app sub-span extending beyond end', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span0 = agent.startSpan('foo', 'app', { startTime: 10 })
  transaction.end(null, 20)
  // span1 is *not* created, because cannot create a span on an ended transaction.
  var span1 = agent.startSpan('SELECT *', 'db.mysql', { startTime: 20, childOf: span0 })
  if (span0) span0.end(30)
  if (span1) span1.end(30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 20 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    t.notOk(finders.span(metricsets, { type: 'db.mysql' }), 'does not have un-ended spans')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with other sub-span extending beyond end', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  var span = agent.startSpan('SELECT *', 'db.mysql', { startTime: 10 })
  transaction.end(null, 20)
  if (span) span.end(30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 20 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    t.notOk(finders.span(metricsets, { type: 'db.mysql' }), 'does not have un-ended spans')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

test('with other sub-span starting after end', t => {
  const agent = new Agent().start(testAgentOpts)

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 })
  transaction.end(null, 10)
  var span = agent.startSpan('SELECT *', 'db.mysql', { startTime: 20, childOf: transaction })
  if (span) span.end(30)

  // See "Wait" comment above.
  setTimeout(function () {
    const metricsets = agent._transport.metricsets
    const found = {
      transaction: finders.transaction(metricsets),
      transaction_span: finders['transaction span'](metricsets)
    }

    t.ok(found.transaction, 'found transaction metricset')
    t.deepEqual(found.transaction.samples, {
      'transaction.duration.count': { value: 1 },
      'transaction.duration.sum.us': { value: 10 },
      'transaction.breakdown.count': { value: 1 }
    }, 'sample values match')

    t.ok(found.transaction_span, 'found app span metricset')
    t.deepEqual(found.transaction_span.samples, {
      'span.self_time.count': { value: 1 },
      'span.self_time.sum.us': { value: 10 }
    }, 'sample values match')

    t.notOk(finders.span(metricsets, { type: 'db.mysql' }), 'does not have un-ended spans')

    agent.destroy()
    t.end()
  }, testMetricsIntervalMs)
})

function assertTransaction (t, expected, received) {
  t.comment('transaction')
  t.strictEqual(received.name, expected.name, 'type matches')
  t.strictEqual(received.type, expected.type, 'type matches')
  t.strictEqual(received.result, expected.result, 'result matches')
  t.strictEqual(received.sampled, expected.sampled, 'sampled state matches')
}

function assertSpan (t, expected, received) {
  t.comment('span')
  t.strictEqual(received.name, expected.name, 'name matches')
  t.strictEqual(received.type, expected.type, 'type matches')
}

function assertMetricSet (t, name, metricsets, { transaction, span } = {}) {
  const metricSet = finders[name](metricsets, span)
  const keys = metrics[name]
  const expected = expectations[name](transaction, span)

  t.comment(`metricSet - ${name} metrics`)
  t.ok(metricSet, 'found metricset')
  assertMetricSetKeys(t, metricSet, keys)
  assertMetricSetData(t, metricSet, expected)
}

function assertMetricSetKeys (t, metricSet, keys) {
  t.deepEqual(Object.keys(metricSet.samples).sort(), keys.sort(), 'has expected sample keys')
}

function assertMetricSetData (t, metricSet, expected) {
  t.deepEqual(metricSet.transaction, expected.transaction, 'has expected transaction data')
  t.deepEqual(metricSet.span, expected.span, 'has expected span data')
}
