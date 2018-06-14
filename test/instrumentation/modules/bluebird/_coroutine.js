'use strict'

var semver = require('semver')
var BLUEBIRD_VERSION = require('bluebird/package').version

module.exports = function (test, Promise, ins) {
  var bluebird = Promise

  test('Promise.coroutine', function (t) {
    t.plan(10)

    function PingPong (trans) {
      this.trans = trans
      this.start = Date.now()
      this.pingTime = null
      this.pongTime = null
    }

    PingPong.prototype.ping = Promise.coroutine(function * (val) {
      if (val === 2) {
        this.pingTime = Date.now()
        assertPingPong(t, ins, this)
        return
      }
      yield Promise.delay(1)
      this.pong(val + 1)
    })

    PingPong.prototype.pong = Promise.coroutine(function * (val) {
      this.pongTime = Date.now()
      yield Promise.delay(1)
      this.ping(val + 1)
    })

    twice(function () {
      var trans = ins.startTransaction()
      var a = new PingPong(trans)
      a.ping(0)
    })
  })

  if (semver.satisfies(BLUEBIRD_VERSION, '>3.4.0')) {
    test('Promise.coroutine.addYieldHandler', function (t) {
      t.plan(10)

      var Promise = bluebird.getNewLibraryCopy()

      Promise.coroutine.addYieldHandler(function (value) {
        return Promise.delay(value)
      })

      function PingPong (trans) {
        this.trans = trans
        this.start = Date.now()
        this.pingTime = null
        this.pongTime = null
      }

      PingPong.prototype.ping = Promise.coroutine(function * (val) {
        if (val === 2) {
          this.pingTime = Date.now()
          assertPingPong(t, ins, this)
          return
        }
        yield 1
        this.pong(val + 1)
      })

      PingPong.prototype.pong = Promise.coroutine(function * (val) {
        this.pongTime = Date.now()
        yield 1
        this.ping(val + 1)
      })

      twice(function () {
        var trans = ins.startTransaction()
        var a = new PingPong(trans)
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

        Promise.spawn(function * () {
          return yield Promise.resolve('foo')
        }).then(function (value) {
          t.equal(value, 'foo')
          t.equal(ins.currentTransaction.id, trans.id)
        })
      })
    })
  }
}

function assertPingPong (t, ins, p) {
  t.ok(p.start <= p.pongTime, 'after ping, min 1ms should have passed (took ' + (p.pongTime - p.start) + 'ms)')
  t.ok(p.start + 10 > p.pongTime, 'after ping, max 10ms should have passed (took ' + (p.pongTime - p.start) + 'ms)')
  t.ok(p.pongTime <= p.pingTime, 'after pong, min 2ms should have passed (took ' + (p.pingTime - p.pongTime) + 'ms)')
  t.ok(p.pongTime + 10 > p.pingTime, 'after pong, max 10ms should have passed (took ' + (p.pingTime - p.pongTime) + 'ms)')
  t.equal(ins.currentTransaction.id, p.trans.id)
}

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}
