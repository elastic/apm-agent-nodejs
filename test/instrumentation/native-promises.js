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

test('new Promise -> resolve -> then', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve) {
        resolve('foo')
      }).then(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

test('new Promise -> reject -> catch', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        reject('foo')
      }).then(function (data) {
        t.fail('should not resolve')
      }).catch(function (reason) {
        t.equal(reason, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

test('new Promise -> reject -> then (2nd arg)', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        reject('foo')
      }).then(function (data) {
        t.fail('should not resolve')
      }, function (reason) {
        t.equal(reason, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

test('Promise.resolve', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      Promise.resolve('foo')
        .then(function (data) {
          t.equal(data, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catch(function (reason) {
          t.fail('should not reject')
        })
    })
  }
})

test('Promise.reject', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      Promise.reject('foo')
        .then(function (reason) {
          t.fail('should not resolve')
        })
        .catch(function (reason) {
          t.equal(reason, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  }
})

test('Promise.all', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
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
  }
})

test('Promise.race - 2nd resolve', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
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
  }
})

test('Promise.race - 1st resolve', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
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
      }, function (reason) {
        t.fail('should not reject')
      })
    })
  }
})

test('Promise.race - 2nd reject', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      var p1 = new Promise(function (resolve, reject) {
        setTimeout(resolve, 50, 'one')
      })
      var p2 = new Promise(function (resolve, reject) {
        setTimeout(reject, 10, 'two')
      })

      Promise.race([p1, p2]).then(function (data) {
        t.fail('should not resolve')
      }, function (reason) {
        t.equal(reason, 'two')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

test('return new Promise', function (t) {
  t.plan(12)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
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
  }
})

// non-standard v8
test('Promise.defer -> resolve', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      var deferred = Promise.defer()
      setTimeout(deferred.resolve.bind(deferred), 10, 'foo')
      deferred.promise.then(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

// non-standard v8
test('Promise.defer -> reject', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      var deferred = Promise.defer()
      setTimeout(deferred.reject.bind(deferred), 10, 'foo')
      deferred.promise.then(function (data) {
        t.fail('should not resolve')
      }, function (reason) {
        t.equal(reason, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  }
})

// non-standard v8
test('Promise.prototype.chain - short', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        resolve('foo')
      }).chain(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }, function (reason) {
        t.fail('should not reject')
      })
    })
  }
})

// non-standard v8
test('Promise.prototype.chain - long', function (t) {
  t.plan(8)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      new Promise(function (resolve, reject) {
        resolve('foo')
      }).chain(function (data) {
        t.equal(data, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return 'bar'
      }, function (reason) {
        t.fail('should not reject')
      }).chain(function (data) {
        t.equal(data, 'bar')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }, function (reason) {
        t.fail('should not reject')
      })
    })
  }
})

// non-standard v8
test('Promise.accept', function (t) {
  t.plan(4)

  runTest()
  runTest()

  function runTest () {
    setImmediate(function () {
      var trans = ins.startTransaction()
      Promise.accept('foo')
        .then(function (data) {
          t.equal(data, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catch(function (reason) {
          t.fail('should not reject')
        })
    })
  }
})
