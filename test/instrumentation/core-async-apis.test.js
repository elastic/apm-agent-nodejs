/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../..').start({
  serviceName: 'test-core-async-apis',
  captureExceptions: false
})

const test = require('tape')

const ins = agent._instrumentation

test('setTimeout', function (t) {
  t.plan(2)
  twice(function () {
    const trans = agent.startTransaction()
    setTimeout(function () {
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    }, 50)
  })
})

test('setInterval', function (t) {
  t.plan(2)
  twice(function () {
    const trans = agent.startTransaction()
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
    const trans = agent.startTransaction()
    setImmediate(function () {
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    })
  })
})

test('process.nextTick', function (t) {
  t.plan(2)
  twice(function () {
    const trans = agent.startTransaction()
    process.nextTick(function () {
      t.strictEqual(ins.currTransaction() && ins.currTransaction().id, trans.id)
      trans.end()
    })
  })
})

test('pre-defined, pre-resolved shared promise', function (t) {
  t.plan(4)

  const p = Promise.resolve('success')

  twice(function () {
    const trans = agent.startTransaction()
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
    const p = Promise.resolve('success')
    const trans = agent.startTransaction()
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
    const p = new Promise(function (resolve) {
      setTimeout(function () {
        resolve('success')
      }, 20)
    })
    const trans = agent.startTransaction()
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
    const trans = agent.startTransaction()
    const p = new Promise(function (resolve) {
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

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
