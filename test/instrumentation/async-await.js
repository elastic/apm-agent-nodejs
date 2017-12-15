'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false
})
var ins = agent._instrumentation

var test = require('tape')
var semver = require('semver')

// async/await isn't supported in old versions of Node.js
if (semver.lt(process.version, '7.0.0')) process.exit()

var _async = require('./_async-await')

test('await promise', function (t) {
  t.plan(4)
  var t1 = ins.startTransaction()
  _async.promise(100).then(function (result) {
    t.equal(result, 'SUCCESS')
    t.equal(ins.currentTransaction && ins.currentTransaction.id, t1.id)
  })
  var t2 = ins.startTransaction()
  _async.promise(50).then(function (result) {
    t.equal(result, 'SUCCESS')
    t.equal(ins.currentTransaction && ins.currentTransaction.id, t2.id)
  })
})

test('await non-promise', function (t) {
  t.plan(7)
  var n = 0
  var t1 = ins.startTransaction()
  _async.nonPromise().then(function (result) {
    t.equal(++n, 2) // this should be the first then-callback to execute
    t.equal(result, 'SUCCESS')
    t.equal(ins.currentTransaction && ins.currentTransaction.id, t1.id)
  })
  var t2 = ins.startTransaction()
  _async.nonPromise().then(function (result) {
    t.equal(++n, 3) // this should be the second then-callback to execute
    t.equal(result, 'SUCCESS')
    t.equal(ins.currentTransaction && ins.currentTransaction.id, t2.id)
  })
  t.equal(++n, 1) // this line should execute before any of the then-callbacks
})
