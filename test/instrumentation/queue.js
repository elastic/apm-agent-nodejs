'use strict'

var test = require('tape')
var Queue = require('../../lib/instrumentation/queue')

test('queue flush isolation', function (t) {
  var flush = 0
  var queue = new Queue(function (arr) {
    t.equal(arr.length, 1)
    t.equal(arr[0], ++flush)
    if (flush === 2) t.end()
  })

  queue.add(1)
  queue._flush()
  queue.add(2)
  queue._flush()
})
