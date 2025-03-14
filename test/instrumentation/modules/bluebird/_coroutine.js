/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');
var BLUEBIRD_VERSION = require('bluebird/package').version;

module.exports = function (test, Promise, ins) {
  var bluebird = Promise;

  test('Promise.coroutine', function (t) {
    t.plan(10);

    function PingPong(trans) {
      this.trans = trans;
      this.start = Date.now();
      this.pingDelay = null;
      this.pongDelay = null;
    }

    PingPong.prototype.ping = Promise.coroutine(function* (val) {
      if (val === 2) {
        this.pongDelay = Date.now();
        assertPingPong(t, ins, this);
        return;
      }
      yield Promise.delay(10);
      this.pong(val + 1);
    });

    PingPong.prototype.pong = Promise.coroutine(function* (val) {
      this.pingDelay = Date.now();
      yield Promise.delay(10);
      this.ping(val + 1);
    });

    twice(function () {
      var trans = ins.startTransaction();
      var a = new PingPong(trans);
      a.ping(0);
    });
  });

  if (semver.satisfies(BLUEBIRD_VERSION, '>3.4.0')) {
    test('Promise.coroutine.addYieldHandler', function (t) {
      t.plan(10);

      var Promise = bluebird.getNewLibraryCopy();

      Promise.coroutine.addYieldHandler(function (value) {
        return Promise.delay(value);
      });

      function PingPong(trans) {
        this.trans = trans;
        this.start = Date.now();
        this.pingDelay = null;
        this.pongDelay = null;
      }

      PingPong.prototype.ping = Promise.coroutine(function* (val) {
        if (val === 2) {
          this.pongDelay = Date.now();
          assertPingPong(t, ins, this);
          return;
        }
        yield 10;
        this.pong(val + 1);
      });

      PingPong.prototype.pong = Promise.coroutine(function* (val) {
        this.pingDelay = Date.now();
        yield 10;
        this.ping(val + 1);
      });

      twice(function () {
        var trans = ins.startTransaction();
        var a = new PingPong(trans);
        a.ping(0);
      });
    });
  }

  // Promise.spawn throws a deprecation error in <=2.8.2
  if (semver.gt(BLUEBIRD_VERSION, '2.8.2')) {
    test('Promise.spawn', function (t) {
      t.plan(4);
      twice(function () {
        var trans = ins.startTransaction();

        Promise.spawn(function* () {
          return yield Promise.resolve('foo');
        }).then(function (value) {
          t.strictEqual(value, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
      });
    });
  }
};

function assertPingPong(t, ins, p) {
  // Since setTimeout has a weird behavior[1] the function might be called
  // slightly before it's scheduled. For pingDelay=10ms we have observed an
  // actual delay of as low as 8ms.
  //
  // [1] https://twitter.com/wa7son/status/1009048999972818944
  const tolerance = 3;
  t.ok(
    p.start + (10 - tolerance) <= p.pingDelay,
    'ping should be delayed min 9ms (delayed ' +
      (p.pingDelay - p.start) +
      'ms)',
  );
  t.ok(
    p.pingDelay + (10 - tolerance) <= p.pongDelay,
    'pong should be delayed min 9ms (delayed ' +
      (p.pongDelay - p.pingDelay) +
      'ms)',
  );

  // The following two asserts are easily affected by event loop satuation and
  // simple process execution slowdown when the CPU core is busy with other
  // things. It's also not critical as we're already testing Promise.delay in
  // isolation in its own test. So we've added a generous one second allowed
  // delay.
  t.ok(
    p.start + 1000 > p.pingDelay,
    'ping should be delayed max 1000ms (delayed ' +
      (p.pingDelay - p.start) +
      'ms)',
  );
  t.ok(
    p.pingDelay + 1000 > p.pongDelay,
    'pong should be delayed max 1000ms (delayed ' +
      (p.pongDelay - p.pingDelay) +
      'ms)',
  );

  t.strictEqual(ins.currTransaction().id, p.trans.id);
}

function twice(fn) {
  setImmediate(fn);
  setImmediate(fn);
}
