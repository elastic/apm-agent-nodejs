'use strict'

var test = require('tape')
var Queue = require('../../lib/instrumentation/queue')

test('maxQueueSize', function (t) {
  var opts = {
    maxQueueSize: 5,
    flushInterval: 1e6
  }

  var queue = new Queue(opts, function (arr) {
    t.deepEqual(arr, [0, 1, 2, 3, 4])
    t.end()
  })

  for (var n = 0; n < 9; n++) queue.add(n)
})

test('queue flush isolation', function (t) {
  var flush = 0
  var queue = new Queue({maxQueueSize: 1}, function (arr) {
    t.equal(arr.length, 1)
    t.equal(arr[0], ++flush)
    if (flush === 2) t.end()
  })

  queue.add(1)
  queue.add(2)
})

test('queue flush callback success', function (t) {
  var flush = 0
  var queue = new Queue({maxQueueSize: 2}, function (arr, done) {
    t.equal(arr.length, 1)
    t.deepEqual(arr, [1])
    flush++
    done()
  })

  queue.add(1)
  queue._flush(function (err) {
    t.error(err)
    t.equal(flush, 1)
    t.end()
  })
})

test('queue flush callback error', function (t) {
  var error = new Error('this is an error')
  var flush = 0
  var queue = new Queue({maxQueueSize: 2}, function (arr, done) {
    t.equal(arr.length, 1)
    t.deepEqual(arr, [1])
    flush++
    done(error)
  })

  queue.add(1)
  queue._flush(function (err) {
    t.equal(err, error)
    t.equal(flush, 1)
    t.end()
  })
})
