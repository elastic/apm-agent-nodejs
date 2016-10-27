'use strict'

var agent = require('../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})
var ins = agent._instrumentation

var semver = require('semver')

// Native promises wasn't available until Node.js 0.12
if (!semver.satisfies(process.version, '>=0.12')) process.exit()

var test = require('tape')

require('./_shared-promise-tests')(test, Promise, ins)

// non-standard v8
if (semver.lt(process.version, '7.0.0')) {
  test('Promise.prototype.chain - short', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        resolve('foo')
      }).chain(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }, function () {
        t.fail('should not reject')
      })
    })
  })

  // non-standard v8
  test('Promise.prototype.chain - long', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        resolve('foo')
      }).chain(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return 'bar'
      }, function () {
        t.fail('should not reject')
      }).chain(function (data) {
        t.equal(data, 'bar')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }, function () {
        t.fail('should not reject')
      })
    })
  })

  // non-standard v8
  test('Promise.accept', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      Promise.accept('foo')
        .then(function (data) {
          t.equal(data, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catch(function () {
          t.fail('should not reject')
        })
    })
  })
}

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
