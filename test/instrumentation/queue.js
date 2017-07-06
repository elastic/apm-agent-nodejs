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

  var queue = new Queue(function (err, transactions) {
    t.error(err)
    t.equal(transactions.length, 1, 'should have 1 transaction')
    t.equal(transactions[0].traces.length, 0, 'should have 0 traces')

    switch (++flush) {
      case 1:
        t.equal(transactions[0].name, 'foo0')
        t.equal(transactions[0].type, 'bar0')
        t.equal(transactions[0].result, 'baz0')
        break
      case 2:
        t.equal(transactions[0].name, 'foo1')
        t.equal(transactions[0].type, 'bar1')
        t.equal(transactions[0].result, 'baz1')
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
