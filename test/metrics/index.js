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
  return isRoughlyAbsolute(received, expected, expected * variance)
}

function isRoughlyAbsolute (received, expected, range) {
  const upper = expected + range
  const lower = expected - range
  return received >= lower && received < upper
}

test('reports expected metrics', function (t) {
  let count = 0
  let last

  const timeout = setTimeout(() => {
    t.fail('should not reach timeout')
  }, 2000)

  agent = mockAgent({
    metricsInterval: 0.1,
    hostname: 'foo',
    environment: 'bar'
  }, (metricset = {}) => {
    t.comment(`event #${++count}`)

    t.ok(isRoughlyAbsolute(metricset.timestamp, Date.now() * 1000, 10000), 'has timestamp')
    if (count === 2) {
      t.ok(isRoughlyAbsolute(metricset.timestamp, last + 100000, 10000), 'is about a second later')
    }

    t.deepEqual(metricset.tags, {
      hostname: 'foo',
      env: 'bar'
    }, 'has expected tags')

    const metrics = {
      'system.cpu.total.norm.pct': (value) => {
        t.ok(value >= 0 && value <= 1, 'is betewen 0.0 and 1.0')
      },
      'system.memory.total': (value) => {
        t.equal(value, os.totalmem(), 'should match total memory')
      },
      'system.memory.actual.free': (value) => {
        const free = os.freemem()
        if (os.type() === 'Linux') {
          // On Linux we use MemAvailable from /proc/meminfo as the value for this metric
          // The Node.js API os.freemem() is reporting MemFree from the same file
          t.ok(value > free, `is larger than os.freemem() (value: ${value}, free: ${free})`)
        } else {
          t.ok(isRoughly(value, free, 0.1), `is close to current free memory (value: ${value}, free: ${free})`)
        }
      },
      'system.process.memory.rss.bytes': (value) => {
        const rss = process.memoryUsage().rss
        t.ok(isRoughly(value, rss, 0.1), `is close to current rss (value: ${value}, rss: ${rss})`)
      },
      'nodejs.handles.active': (value) => {
        t.ok(value >= 0, 'is positive')
      },
      'nodejs.requests.active': (value) => {
        t.ok(value >= 0, 'is positive')
      },
      'nodejs.eventloop.delay.avg.ms': (value) => {
        t.ok(value >= 0, 'is positive')
      },
      'nodejs.memory.heap.allocated.bytes': (value) => {
        t.ok(value >= 0, 'is positive')
      },
      'nodejs.memory.heap.used.bytes': (value) => {
        t.ok(value >= 0, 'is positive')
      }
    }

    if (semver.satisfies(process.versions.node, '>=6.1')) {
      metrics['system.process.cpu.total.norm.pct'] = (value) => {
        t.ok(value >= 0 && value <= 1, 'is betewen 0.0 and 1.0')
      }
      metrics['system.process.cpu.system.norm.pct'] = (value) => {
        t.ok(value >= 0 && value <= 1, 'is betewen 0.0 and 1.0')
      }
      metrics['system.process.cpu.user.norm.pct'] = (value) => {
        t.ok(value >= 0 && value <= 1, 'is betewen 0.0 and 1.0')
      }
    }

    for (const name of Object.keys(metrics)) {
      const metric = metricset.samples[name]
      t.comment(name)
      t.ok(metric, `is present`)
      t.equal(typeof metric.value, 'number', 'is a number')
      t.ok(Number.isFinite(metric.value), `is finite (was: ${metric.value})`)
      metrics[name](metric.value)
    }

    if (count === 2) {
      clearTimeout(timeout)
      t.end()
    } else {
      last = metricset.timestamp
    }
  })

  metrics = new Metrics(agent)
  metrics.start()
})
