'use strict'

var test = require('tape')

var Timer = require('../../lib/instrumentation/timer')

test('started', function (t) {
  var timer = new Timer()
  t.ok(timer.start > 0)
  t.equal(timer.duration, null)
  t.end()
})

test('ended', function (t) {
  var timer = new Timer()
  timer.end()
  t.ok(timer.duration > 0)
  t.ok(timer.duration < 100)
  t.end()
})

test('ended twice', function (t) {
  var timer = new Timer()
  timer.end()
  var duration = timer.duration
  timer.end()
  t.equal(timer.duration, duration)
  t.end()
})

test('elapsed', function (t) {
  var timer = new Timer()
  var e1 = timer.elapsed()
  process.nextTick(function () {
    var e2 = timer.elapsed()
    t.ok(e2 > e1)
    timer.end()
    t.ok(timer.duration >= e2)
    t.ok(e2 + 10 > timer.duration)
    t.end()
  })
})

test('custom start time', function (t) {
  var startTime = Date.now() - 1000
  var timer = new Timer(null, startTime)
  t.equal(timer.start, startTime * 1000)
  timer.end()
  t.ok(timer.duration >= 1000, `duration should be equal or more than 1s (was: ${timer.duration})`)
  t.ok(timer.duration < 1100, `duration should be less than 1.1s (was: ${timer.duration})`)
  t.end()
})

test('custom end time', function (t) {
  var startTime = Date.now() - 1000
  var endTime = startTime + 2000.123
  var timer = new Timer(null, startTime)
  timer.end(endTime)
  t.equal(timer.duration, 2000.123)
  t.end()
})
