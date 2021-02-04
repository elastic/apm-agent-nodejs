'use strict'

var flag = process.env.ELASTIC_APM_ASYNC_HOOKS
delete process.env.ELASTIC_APM_ASYNC_HOOKS
var agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false,
  asyncHooks: true
})
process.env.ELASTIC_APM_ASYNC_HOOKS = flag

var test = require('tape')

var ins = agent._instrumentation

test('setTimeout', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    setTimeout(function () {
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    }, 50)
  })
})

test('setInterval', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    var timer = setInterval(function () {
      clearInterval(timer)
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    }, 50)
  })
})

test('setImmediate', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    setImmediate(function () {
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('process.nextTick', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    process.nextTick(function () {
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('pre-defined, pre-resolved shared promise', function (t) {
  t.plan(4)

  var p = Promise.resolve('success')

  twice(function () {
    var trans = agent.startTransaction()
    p.then(function (result) {
      t.strictEqual(result, 'success')
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('pre-defined, pre-resolved non-shared promise', function (t) {
  t.plan(4)

  twice(function () {
    var p = Promise.resolve('success')
    var trans = agent.startTransaction()
    p.then(function (result) {
      t.strictEqual(result, 'success')
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('pre-defined, post-resolved promise', function (t) {
  t.plan(4)
  twice(function () {
    var p = new Promise(function (resolve) {
      setTimeout(function () {
        resolve('success')
      }, 20)
    })
    var trans = agent.startTransaction()
    p.then(function (result) {
      t.strictEqual(result, 'success')
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('post-defined, post-resolved promise', function (t) {
  t.plan(4)
  twice(function () {
    var trans = agent.startTransaction()
    var p = new Promise(function (resolve) {
      setTimeout(function () {
        resolve('success')
      }, 20)
    })
    p.then(function (result) {
      t.strictEqual(result, 'success')
      t.strictEqual(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      trans.end()
    })
  })
})

test('sync/async tracking', function (t) {
  var trans = agent.startTransaction()
  t.strictEqual(trans.sync, true)

  var span1 = agent.startSpan()
  t.strictEqual(span1.sync, true)

  // This span will be *ended* synchronously. It should stay `span.sync=true`.
  var span2 = agent.startSpan()
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after creation')
  span2.end()
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after end')

  setImmediate(() => {
    t.strictEqual(trans.sync, false)
    t.strictEqual(span1.sync, false)
    t.strictEqual(span2.sync, true,
      'span2.sync=true later after having ended sync')
    t.end()
  })
})

test.only('span.end()', function ( t ) {
  var transaction = agent.startTransaction()
  
  var firstSpan = agent.startSpan('first-span')
  t.strictEqual(firstSpan.parentId, transaction.id, 'first span is a child of the active transaction')

  process.nextTick(function ( ) {

    var childSpan = agent.startSpan('child-span')

    t.equal(childSpan.parentId, firstSpan.id, 'child-span is a direct child of first-span')

    process.nextTick(function ( ) {

      childSpan.end()

      var siblingSpan = agent.startSpan('sibling-span')

      t.notEqual(siblingSpan.parentId, transaction.id, 'sibling-span is not a direct child of the active transaction')
      t.equal(siblingSpan.parentId, firstSpan.id, 'sibling-span is a direct child of first-span')

      siblingSpan.end()

      firstSpan.end()
      
      transaction.end()

      t.end()

    })

  })

})

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
