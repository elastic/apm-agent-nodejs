/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false
})

const test = require('tape')

const ins = agent._instrumentation

const _async = require('./_async-await')

test('await promise', function (t) {
  t.plan(4)
  const t1 = ins.startTransaction()
  _async.promise(100).then(function (result) {
    t.strictEqual(result, 'SUCCESS')
    t.strictEqual(ins.currTransaction() && ins.currTransaction().id, t1.id)
  })
  const t2 = ins.startTransaction()
  _async.promise(50).then(function (result) {
    t.strictEqual(result, 'SUCCESS')
    t.strictEqual(ins.currTransaction() && ins.currTransaction().id, t2.id)
  })
})

test('await non-promise', function (t) {
  t.plan(7)
  let n = 0
  const t1 = ins.startTransaction()
  _async.nonPromise().then(function (result) {
    t.strictEqual(++n, 2) // this should be the first then-callback to execute
    t.strictEqual(result, 'SUCCESS')
    t.strictEqual(ins.currTransaction() && ins.currTransaction().id, t1.id)
  })
  const t2 = ins.startTransaction()
  _async.nonPromise().then(function (result) {
    t.strictEqual(++n, 3) // this should be the second then-callback to execute
    t.strictEqual(result, 'SUCCESS')
    t.strictEqual(ins.currTransaction() && ins.currTransaction().id, t2.id)
  })
  t.strictEqual(++n, 1) // this line should execute before any of the then-callbacks
})
