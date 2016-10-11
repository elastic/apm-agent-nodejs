'use strict'

var semver = require('semver')
var BLUEBIRD_VERSION = require('bluebird/package').version

module.exports = function (test, Promise, ins) {
  var bluebird = Promise

  // bluebird@3.1.2 have a bug in the Promise.coroutine code prior to iojs 3
  if (!(semver.lt(process.version, '3.0.0') &&
        semver.eq(BLUEBIRD_VERSION, '3.1.2'))) {
    test('Promise.coroutine', function (t) {
      t.plan(10)
      twice(function () {
        var trans = ins.startTransaction()
        var start = Date.now()
        var pongTime

        function PingPong () {}

        PingPong.prototype.ping = Promise.coroutine(function* (val) {
          if (val === 2) {
            // timing is hard, let's give it a -5ms slack
            var pingTime = Date.now()
            t.ok(pongTime + 45 <= pingTime, 'after pong, min 100ms should have passed (took ' + (pingTime - pongTime) + 'ms)')
            t.ok(pongTime + 100 > pingTime, 'after pong, max 125ms should have passed (took ' + (pingTime - pongTime) + 'ms)')
            t.equal(ins.currentTransaction._uuid, trans._uuid)
            return
          }
          yield Promise.delay(50)
          this.pong(val + 1)
        })

        PingPong.prototype.pong = Promise.coroutine(function* (val) {
          // timing is hard, let's give it a -5ms slack
          pongTime = Date.now()
          t.ok(start + 45 <= pongTime, 'after ping, min 50ms should have passed (took ' + (pongTime - start) + 'ms)')
          t.ok(start + 100 > pongTime, 'after ping, max 75ms should have passed (took ' + (pongTime - start) + 'ms)')
          yield Promise.delay(50)
          this.ping(val + 1)
        })

        var a = new PingPong()
        a.ping(0)
      })
    })
  }

  if (semver.satisfies(BLUEBIRD_VERSION, '>3.4.0')) {
    test('Promise.coroutine.addYieldHandler', function (t) {
      t.plan(10)

      var Promise = bluebird.getNewLibraryCopy()

      Promise.coroutine.addYieldHandler(function (value) {
        return Promise.delay(value)
      })

      twice(function () {
        var trans = ins.startTransaction()
        var start = Date.now()
        var pongTime

        function PingPong () {}

        PingPong.prototype.ping = Promise.coroutine(function* (val) {
          if (val === 2) {
            // timing is hard, let's give it a -5ms slack
            var pingTime = Date.now()
            t.ok(pongTime + 45 <= pingTime, 'after pong, min 100ms should have passed (took ' + (pingTime - pongTime) + 'ms)')
            t.ok(pongTime + 100 > pingTime, 'after pong, max 125ms should have passed (took ' + (pingTime - pongTime) + 'ms)')
            t.equal(ins.currentTransaction._uuid, trans._uuid)
            return
          }
          yield 50
          this.pong(val + 1)
        })

        PingPong.prototype.pong = Promise.coroutine(function* (val) {
          // timing is hard, let's give it a -5ms slack
          pongTime = Date.now()
          t.ok(start + 45 <= pongTime, 'after ping, min 50ms should have passed (took ' + (pongTime - start) + 'ms)')
          t.ok(start + 100 > pongTime, 'after ping, max 75ms should have passed (took ' + (pongTime - start) + 'ms)')
          yield 50
          this.ping(val + 1)
        })

        var a = new PingPong()
        a.ping(0)
      })
    })
  }

  // Promise.spawn throws a deprecation error in <=2.8.2
  if (semver.gt(BLUEBIRD_VERSION, '2.8.2')) {
    test('Promise.spawn', function (t) {
      t.plan(4)
      twice(function () {
        var trans = ins.startTransaction()

        Promise.spawn(function* () {
          return yield Promise.resolve('foo')
        }).then(function (value) {
          t.equal(value, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
      })
    })
  }
}

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
