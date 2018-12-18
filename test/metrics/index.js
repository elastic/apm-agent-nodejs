'use strict'

const os = require('os')

const semver = require('semver')
const test = require('tape')

const Metrics = require('../../lib/metrics')

let agent
let metrics

function mockAgent (conf = {}, onMetricSet) {
  return {
    _conf: conf,
    _transport: {
      sendMetricSet: onMetricSet
    }
  }
}

function isRoughly (received, expected, variance) {
  const range = expected * variance
  const upper = expected + range
  const lower = expected - range
  return received >= lower && received < upper
}

test('reports expected metrics', function (t) {
  agent = mockAgent({
    metricsInterval: 1
  }, (metricset = {}) => {
    t.ok(isRoughly(metricset.timestamp, Date.now(), 0.000001), 'has timestamp')
    t.deepEqual(metricset.tags, {
      hostname: os.hostname(),
      env: process.env.NODE_ENV || 'development'
    }, 'has expected tags')

    const metrics = {
      'system.cpu.total.norm.pct': (value) => {
        t.ok(isRoughly(value, 0.1, 10), 'should be a floating point number from 0 to 1')
      },
      'system.memory.total': (value) => {
        t.equal(value, os.totalmem(), 'should match total memory')
      },
      'system.memory.actual.free': (value) => {
        t.ok(isRoughly(value, os.freemem(), 0.1), 'should be close to current free memory')
      },
      'system.process.memory.rss.bytes': (value) => {
        t.ok(isRoughly(value, process.memoryUsage().rss, 0.1), 'should be close to current rss')
      }
    }

    if (semver.satisfies(process.versions.node, '^6.1')) {
      metrics['system.process.cpu.total.norm.pct'] = (value) => {
        t.ok(isRoughly(value, 0.1, 10), 'should be a floating point number from 0 to 1')
      }
    }

    for (const name of Object.keys(metrics)) {
      const metric = metricset.samples[name]
      t.comment(name)
      t.ok(metric, `should be present`)
      metrics[name](metric.value)
    }

    t.end()
  })

  metrics = new Metrics(agent)
  metrics.start()
})
