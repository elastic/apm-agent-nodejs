'use strict'

var semver = require('semver')

module.exports = function (test, Promise, ins) {
  test('new Promise -> resolve -> then', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve) {
        resolve('foo')
      }).then(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  var catchNames = ['catch']
  // caught is a catch alias and an early ECMAScript standard since abandoned
  if (Promise.prototype.caught) catchNames.push('caught')
  catchNames.forEach(function (fnName) {
    test('new Promise -> reject -> ' + fnName, function (t) {
      t.plan(4)
      twice(function () {
        var trans = ins.startTransaction()
        new Promise(function (resolve, reject) {
          reject('foo')
        }).then(function () {
          t.fail('should not resolve')
        })[fnName](function (reason) {
          t.equal(reason, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
      })
    })

    test('new Promise -> reject -> ' + fnName + ' -> then', function (t) {
      t.plan(8)
      twice(function () {
        var trans = ins.startTransaction()
        new Promise(function (resolve, reject) {
          reject('foo')
        })[fnName](function (err) {
          t.equal(err, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
          return Promise.resolve('bar')
        }).then(function (result) {
          t.equal(result, 'bar')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
      })
    })
  })

  test('new Promise -> reject -> then (2nd arg)', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        reject('foo')
      }).then(function () {
        t.fail('should not resolve')
      }, function (reason) {
        t.equal(reason, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('Promise.resolve', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      Promise.resolve('foo')
        .then(function (data) {
          t.equal(data, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catch(function () {
          t.fail('should not reject')
        })
    })
  })

  test('Promise.reject', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      Promise.reject('foo')
        .then(function () {
          t.fail('should not resolve')
        })
        .catch(function (reason) {
          t.equal(reason, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('Promise.all', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = Promise.resolve(3)
      var p2 = 1337
      var p3 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'foo')
      })

      Promise.all([p1, p2, p3]).then(function (values) {
        t.deepEqual(values, [3, 1337, 'foo'])
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('Promise.race - 2nd resolve', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 50, 'one')
      })
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'two')
      })

      Promise.race([p1, p2]).then(function (data) {
        t.equal(data, 'two')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('Promise.race - 1st resolve', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 10, 'one')
      })
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(reject, 50, 'two')
      })

      Promise.race([p1, p2]).then(function (data) {
        t.equal(data, 'one')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }, function () {
        t.fail('should not reject')
      })
    })
  })

  test('Promise.race - 2nd reject', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 50, 'one')
      })
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(reject, 10, 'two')
      })

      Promise.race([p1, p2]).then(function () {
        t.fail('should not resolve')
      }, function (reason) {
        t.equal(reason, 'two')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('return new Promise', function (t) {
    t.plan(12)
    twice(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve) {
        resolve('foo')
      }).then(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return new Promise(function (resolve) {
          resolve('bar')
        })
      }).then(function (data) {
        t.equal(data, 'bar')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return Promise.resolve('baz')
      }).then(function (data) {
        t.equal(data, 'baz')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  // non-standard v8/bluebird
  if (semver.lt(process.version, '7.0.0')) {
    test('Promise.defer -> resolve', function (t) {
      t.plan(4)
      twice(function () {
        var trans = ins.startTransaction()
        var deferred = Promise.defer()
        setTimeout(deferred.resolve.bind(deferred), 10, 'foo')
        deferred.promise.then(function (data) {
          t.equal(data, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
      })
    })

    // non-standard v8/bluebird
    test('Promise.defer -> reject', function (t) {
      t.plan(4)
      twice(function () {
        var trans = ins.startTransaction()
        var deferred = Promise.defer()
        setTimeout(deferred.reject.bind(deferred), 10, 'foo')
        deferred.promise.then(function () {
          t.fail('should not resolve')
        }, function (reason) {
          t.equal(reason, 'foo')
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
