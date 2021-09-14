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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    }, 50)
  })
})

test('setImmediate', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    setImmediate(function () {
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    })
  })
})

test('process.nextTick', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    process.nextTick(function () {
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
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
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    })
  })
})

// XXX move this out of async-hooks. It should work with asyncHooks=false as well!
//     Already have tests for sync-ness in test/instrumentation/{span,transaction}.test.js
test('span.sync', function (t) {
  var trans = agent.startTransaction()
  t.strictEqual(trans.sync, true)

  var span1 = agent.startSpan('span1')
  t.strictEqual(span1.sync, true)

  // This span will be *ended* synchronously. It should stay `span.sync=true`.
  var span2 = agent.startSpan('span2')
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after creation')
  span2.end()
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after end')

  setImmediate(() => {
    // XXX Change in behaviour: the guarantee is only to update `.sync` after .end()
    span1.end()
    t.strictEqual(span1.sync, false)
    trans.end()
    // XXX drop trans.sync checking with https://github.com/elastic/apm-agent-nodejs/issues/2292
    t.strictEqual(trans.sync, false)
    t.strictEqual(span2.sync, true,
      'span2.sync=true later after having ended sync')
    t.end()
  })
})

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
