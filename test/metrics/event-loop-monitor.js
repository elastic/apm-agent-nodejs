'use strict'

const test = require('tape')

const EventLoopDelayHistogram = require('../../lib/metrics/event-loop-monitor')

test('event-loop-monitor fallback', t => {
  let monitor = new EventLoopDelayHistogram()
  monitor = monitor.concat([5, 25, 7, 235, 33, 1, 46, 9, 24, 75])

  const mean = 46
  const stddev = 66.5221767533204
  const min = 1
  const max = 235

  t.equal(monitor.mean, mean, 'has correct mean')
  t.equal(monitor.stddev, stddev, 'has correct standard deviation')
  t.equal(monitor.min, min, 'has correct minimum')
  t.equal(monitor.max, max, 'has correct maximum')

  t.end()
})

class TimeoutCollection {
  constructor () {
    this.pending = new Set()
    this.stopped = false
  }

  create (cb, ...args) {
    if (this.stopped) return

    const timer = setTimeout(() => {
      this.pending.delete(timer)
      cb()
    }, ...args)

    this.pending.add(timer)
    return timer
  }

  stop () {
    this.stopped = true
    for (let timer of this.pending) {
      clearTimeout(timer)
    }
  }
}

function makeStorm (n) {
  const timers = new TimeoutCollection()

  function chain () {
    timers.create(chain, Math.floor(Math.random() * 50))
  }

  for (let i = 0; i < n; i++) {
    chain()
  }

  return timers
}

function toMillis (t) {
  return (t[0] * 1e3) + (t[1] / 1e6)
}

function nanoToMilli (ms) {
  return ms / 1e6
}

test('storm', t => {
  t.plan(10)

  const sampler = new EventLoopDelayHistogram({ resolution: 10 })
  sampler.enable()
  let last = process.hrtime()

  const check = setInterval(() => {
    const value = nanoToMilli(sampler.mean || 0)
    const total = toMillis(process.hrtime(last))
    last = process.hrtime()
    sampler.reset()
    t.ok(value >= 0 && value < total, `value is realistic (value: ${value}, total: ${total})`)
  }, 100)

  t.on('end', () => {
    clearInterval(check)
    sampler.disable()
    storm.stop()
  })

  const storm = makeStorm(1e4)
})
