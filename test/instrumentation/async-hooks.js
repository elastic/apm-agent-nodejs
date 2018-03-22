'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false,
  asyncHooks: true
})

var semver = require('semver')
var test = require('tape')

var ins = agent._instrumentation

test('setTimeout', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    setTimeout(function () {
      t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
    }, 50)
  })
})

test('setInterval', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    var timer = setInterval(function () {
      clearInterval(timer)
      t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
    }, 50)
  })
})

test('setImmediate', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    setImmediate(function () {
      t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
    })
  })
})

test('process.nextTick', function (t) {
  t.plan(2)
  twice(function () {
    var trans = agent.startTransaction()
    process.nextTick(function () {
      t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
    })
  })
})

// We can't instrument ore-defined promises properly without async-hooks, so
// lets not run these tests on versions of Node.js without async-hooks
if (semver.gte(process.version, '8.2.0')) {
  test('pre-defined, pre-resolved shared promise', function (t) {
    t.plan(4)

    var p = Promise.resolve('success')

    twice(function () {
      var trans = agent.startTransaction()
      p.then(function (result) {
        t.equal(result, 'success')
        t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      })
    })
  })

  test('pre-defined, pre-resolved non-shared promise', function (t) {
    t.plan(4)

    twice(function () {
      var p = Promise.resolve('success')
      var trans = agent.startTransaction()
      p.then(function (result) {
        t.equal(result, 'success')
        t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
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
        t.equal(result, 'success')
        t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
      })
    })
  })
}

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
      t.equal(result, 'success')
      t.equal(ins.currentTransaction && ins.currentTransaction.id, trans.id)
    })
  })
})

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
