/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = function (test, Promise, ins) {
  test('new Promise -> resolve -> then', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      new Promise(function (resolve) {
        resolve('foo');
      }).then(function (data) {
        t.strictEqual(data, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });

  var catchNames = ['catch'];
  // caught is a catch alias and an early ECMAScript standard since abandoned
  if (Promise.prototype.caught) catchNames.push('caught');
  catchNames.forEach(function (fnName) {
    test('new Promise -> reject -> ' + fnName, function (t) {
      t.plan(4);
      twice(function () {
        var trans = ins.startTransaction();
        new Promise(function (resolve, reject) {
          reject(new Error('foo'));
        })
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](function (reason) {
            t.strictEqual(reason.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          });
      });
    });

    test('new Promise -> reject -> ' + fnName + ' -> then', function (t) {
      t.plan(8);
      twice(function () {
        var trans = ins.startTransaction();
        new Promise(function (resolve, reject) {
          reject(new Error('foo'));
        })
          [fnName](function (err) {
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
            return Promise.resolve('bar');
          })
          .then(function (result) {
            t.strictEqual(result, 'bar');
            t.strictEqual(ins.currTransaction().id, trans.id);
          });
      });
    });
  });

  test('new Promise -> reject -> then (2nd arg)', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      new Promise(function (resolve, reject) {
        reject(new Error('foo'));
      }).then(
        function () {
          t.fail('should not resolve');
        },
        function (reason) {
          t.strictEqual(reason.message, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        },
      );
    });
  });

  test('Promise.resolve', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      Promise.resolve('foo')
        .then(function (data) {
          t.strictEqual(data, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('Promise.reject', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      Promise.reject(new Error('foo'))
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (reason) {
          t.strictEqual(reason.message, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });

  test('Promise.all', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = Promise.resolve(3);
      var p2 = 1337;
      var p3 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'foo');
      });

      Promise.all([p1, p2, p3]).then(function (values) {
        t.deepEqual(values, [3, 1337, 'foo']);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });

  test('Promise.race - 2nd resolve', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 50, 'one');
      });
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'two');
      });

      Promise.race([p1, p2]).then(function (data) {
        t.strictEqual(data, 'two');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });

  test('Promise.race - 1st resolve', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'one');
      });
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(reject, 50, 'two');
      });

      Promise.race([p1, p2]).then(
        function (data) {
          t.strictEqual(data, 'one');
          t.strictEqual(ins.currTransaction().id, trans.id);
        },
        function () {
          t.fail('should not reject');
        },
      );
    });
  });

  test('Promise.race - 2nd reject', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 50, 'one');
      });
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(reject, 10, 'two');
      });

      Promise.race([p1, p2]).then(
        function () {
          t.fail('should not resolve');
        },
        function (reason) {
          t.strictEqual(reason, 'two');
          t.strictEqual(ins.currTransaction().id, trans.id);
        },
      );
    });
  });

  test('return new Promise', function (t) {
    t.plan(12);
    twice(function () {
      var trans = ins.startTransaction();
      new Promise(function (resolve) {
        resolve('foo');
      })
        .then(function (data) {
          t.strictEqual(data, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
          return new Promise(function (resolve) {
            resolve('bar');
          });
        })
        .then(function (data) {
          t.strictEqual(data, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
          return Promise.resolve('baz');
        })
        .then(function (data) {
          t.strictEqual(data, 'baz');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
};

function twice(fn) {
  setImmediate(fn);
  setImmediate(fn);
}
