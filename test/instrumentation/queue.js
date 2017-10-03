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
