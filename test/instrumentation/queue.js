'use strict'

var test = require('tape')
var mockAgent = require('./_agent')
var Transaction = require('../../lib/instrumentation/transaction')
var Queue = require('../../lib/instrumentation/queue')

test('queue flush isolation', function (t) {
  var agent = mockAgent()
  var flush = 0
  var t0 = new Transaction(agent, 'foo0', 'bar0')
  var t1 = new Transaction(agent, 'foo1', 'bar1')
  t0.result = 'baz0'
  t1.result = 'baz1'

  var queue = new Queue(function (data) {
    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    t.equal(data.traces.groups.length, 0, 'should have 0 groups')
    t.equal(data.traces.raw.length, 0, 'should have 0 raw')

    switch (++flush) {
      case 1:
        t.equal(data.transactions[0].transaction, 'foo0')
        t.equal(data.transactions[0].kind, 'bar0')
        t.equal(data.transactions[0].result, 'baz0')
        break
      case 2:
        t.equal(data.transactions[0].transaction, 'foo1')
        t.equal(data.transactions[0].kind, 'bar1')
        t.equal(data.transactions[0].result, 'baz1')
        t.end()
        break
    }
  })

  t0.end()
  t1.end()

  queue.add(t0)
  queue._flush()
  queue.add(t1)
  queue._flush()
})

test('queue sampling', function (t) {
  var agent = mockAgent()
  var t0 = new Transaction(agent, 'same-name', 'same-type')
  var t1 = new Transaction(agent, 'same-name', 'same-type')
  var t2 = new Transaction(agent, 'other-name', 'other-type')
  t0.result = 'same-result'
  t1.result = 'same-result'
  t2.result = 'other-result'

  var queue = new Queue(function (data) {
    t.equal(data.transactions.length, 2, 'should have 2 transaction')
    t.equal(data.transactions[0].transaction, 'same-name')
    t.equal(data.transactions[0].kind, 'same-type')
    t.equal(data.transactions[0].result, 'same-result')
    t.equal(data.transactions[0].durations.length, 2)
    t.equal(data.transactions[0].durations[0], t0.duration())
    t.equal(data.transactions[0].durations[1], t1.duration())
    t.equal(data.transactions[1].transaction, 'other-name')
    t.equal(data.transactions[1].kind, 'other-type')
    t.equal(data.transactions[1].result, 'other-result')
    t.equal(data.transactions[1].durations.length, 1)
    t.equal(data.transactions[1].durations[0], t2.duration())

    t.equal(data.traces.groups.length, 0, 'should have 0 groups')
    t.equal(data.traces.raw.length, 0, 'should have 0 raws')

    t.end()
  })

  t0.end()
  t1.end()
  t2.end()

  queue.add(t0)
  queue.add(t1)
  queue.add(t2)
  queue._flush()
})
