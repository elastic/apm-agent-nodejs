'use strict'

var test = require('tape')
var Timer = require('../../lib/instrumentation/timer')

test('started', function (t) {
  var timer = new Timer()
  t.equal(timer.ended, false)
  t.equal(timer.duration(), null)
  t.end()
})

test('ended', function (t) {
  var timer = new Timer()
  timer.end()
  t.equal(timer.ended, true)
  t.ok(timer.duration() > 0)
  t.ok(timer.duration() < 100)
  t.end()
})

test('ended twice', function (t) {
  var timer = new Timer()
  timer.end()
  var duration = timer.duration()
  timer.end()
  t.equal(timer.ended, true)
  t.equal(timer.duration(), duration)
  t.end()
})

test('offset', function (t) {
  var a = new Timer()
  var b = new Timer()
  var offset = b.offset(a)
  t.ok(offset > 0, 'should be more than 0ms')
  t.ok(offset < 10, 'should be less than 10ms')
  t.end()
})
