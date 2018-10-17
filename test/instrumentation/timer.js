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
