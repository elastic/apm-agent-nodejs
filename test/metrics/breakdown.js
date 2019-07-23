'use strict'

process.env.ELASTIC_APM_TEST = true

const agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0
})

const http = require('http')
const test = require('tape')

const Metrics = require('../../lib/metrics')
const mockClient = require('../_mock_http_client')

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
  'nodejs.eventloop.delay.ns',
  'nodejs.memory.heap.allocated.bytes',
  'nodejs.memory.heap.used.bytes',
  'nodejs.eventloop.delay.avg.ms'
]

if (process.platform === 'linux') {
  basicMetrics.push('system.process.memory.size')
}

test('includes breakdown when sampling', t => {
  const conf = {
    metricsInterval: 1
  }

  resetAgent(7, conf, (data) => {
    t.equal(data.transactions.length, 1, 'has one transaction')
    assertTransaction(t, data.transactions[0], true)

    t.equal(data.spans.length, 1, 'has one span')
    assertSpan(t, data.spans[0])

    t.equal(data.metricsets.length, 5, 'has five metricsets')

    assertMetricSet(t, 'initial basic', data.metricsets[0], basicMetrics)
    assertMetricSet(t, 'second tick basic', data.metricsets[1], basicMetrics)
    assertMetricSet(t, 'transaction', data.metricsets[2], [
      'transaction.duration.count',
      'transaction.duration.sum.us',
      'transaction.breakdown.count'
    ], {
      transaction: {
        name: 'GET unknown route',
        type: 'request'
      }
    })
    assertMetricSet(t, 'transaction span', data.metricsets[3], [
      'span.self_time.count',
      'span.self_time.sum.us'
    ], {
      transaction: {
        name: 'GET unknown route (unnamed)',
        type: 'request'
      },
      span: {
        type: 'custom'
      }
    })
    assertMetricSet(t, 'span', data.metricsets[4], [
      'span.self_time.count',
      'span.self_time.sum.us'
    ], {
      transaction: {
        name: 'GET unknown route',
        type: 'request'
      },
      span: {
        type: 'app'
      }
    })

    agent._metrics.stop()
    server.close()
    t.end()
  })

  var server = http.createServer(function (req, res) {
    var span = agent.startSpan('test')
    setTimeout(function () {
      span.end()
      res.end()
    }, 50)
  })

  server.listen(function () {
    var port = server.address().port
    request(`http://localhost:${port}`)
  })
})

test('does not include breakdown when not sampling', t => {
  const conf = {
    metricsInterval: 1,
    transactionSampleRate: 0
  }

  resetAgent(4, conf, (data) => {
    t.equal(data.transactions.length, 1, 'has one transaction')
    assertTransaction(t, data.transactions[0], false)

    t.equal(data.spans.length, 0, 'has no spans')

    t.equal(data.metricsets.length, 3, 'has three metricsets')
    assertMetricSet(t, 'initial basic', data.metricsets[0], basicMetrics)
    assertMetricSet(t, 'second tick basic', data.metricsets[1], basicMetrics)
    assertMetricSet(t, 'transaction', data.metricsets[2], [
      'transaction.duration.count',
      'transaction.duration.sum.us',
      'transaction.breakdown.count'
    ], {
      transaction: {
        name: 'GET unknown route',
        type: 'request'
      }
    })

    agent._metrics.stop()
    server.close()
    t.end()
  })

  var server = http.createServer(function (req, res) {
    var span = agent.startSpan('test')
    setTimeout(function () {
      if (span) span.end()
      res.end()
    }, 50)
  })

  server.listen(function () {
    var port = server.address().port
    request(`http://localhost:${port}`)
  })
})

function assertTransaction (t, trans, sampled) {
  t.comment('transaction')
  t.equal(trans.type, 'request', 'is a request')
  t.equal(trans.result, 'HTTP 2xx', 'result is 2xx')
  t.equal(trans.sampled, sampled, 'is sampled')
}

function assertSpan (t, span) {
  t.comment('span')
  t.equal(span.type, 'custom', 'is custom type')
  t.equal(span.name, 'test', 'is named test')
}

function assertMetricSet (t, name, metricSet, keys, { transaction, span } = {}) {
  t.comment(`metricSet - ${name} metrics`)
  t.deepEqual(Object.keys(metricSet.samples).sort(), keys.sort(), 'has expected sample keys')
  t.deepEqual(metricSet.transaction, transaction, 'has expected transaction data')
  t.deepEqual(metricSet.span, span, 'has expected span data')
}

function request (url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, function (res) {
      const chunks = []
      res.on('error', reject)
      res.on('data', chunks.push.bind(chunks))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
  })
}

function resetAgent (expected, conf, cb) {
  Object.assign(agent._conf, conf)
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expected, cb)
  agent._metrics = new Metrics(agent)
  agent._metrics.start()
  agent.captureError = function (err) { throw err }
}
