'use strict'

var agent = require('../../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})
var ins = agent._instrumentation

var semver = require('semver')
var test = require('tape')
var Promise = require('bluebird')

var BLUEBIRD_VERSION = require('bluebird/package').version

require('../../_shared-promise-tests')(test, Promise, ins)

if (semver.satisfies(process.version, '>=1.0.0')) require('./_coroutine')(test, Promise, ins)

test('Promise.prototype.spread - all formal', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.all(['foo', 'bar']).spread(function (a, b) {
      t.equal(a, 'foo')
      t.equal(b, 'bar')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.prototype.spread - all promises', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    var arr = [resolved('foo'), resolved('bar')]
    Promise.all(arr).spread(function (a, b) {
      t.equal(a, 'foo')
      t.equal(b, 'bar')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.prototype.spread - then formal', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.delay(1).then(function () {
      return ['foo', 'bar']
    }).spread(function (a, b) {
      t.equal(a, 'foo')
      t.equal(b, 'bar')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.prototype.spread - then promises', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.delay(1).then(function () {
      return [resolved('foo'), resolved('bar')]
    }).spread(function (a, b) {
      t.equal(a, 'foo')
      t.equal(b, 'bar')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

var CATCH_NAMES = ['catch', 'caught']
CATCH_NAMES.forEach(function (fnName) {
  test('new Promise -> reject -> ' + fnName + ' (filtered, first type)', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected(new TypeError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](TypeError, function (err) {
          t.ok(err instanceof TypeError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](ReferenceError, function () {
          t.fail('should not catch a ReferenceError')
        })[fnName](function () {
          t.fail('should not catch a generic error')
        })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, second type)', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected(new ReferenceError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](TypeError, function () {
          t.fail('should not catch a TypeError')
        })[fnName](ReferenceError, function (err) {
          t.ok(err instanceof ReferenceError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](function () {
          t.fail('should not catch a generic error')
        })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, catch-all)', function (t) {
    t.plan(6)
    twice(function () {
      setImmediate(function () {
        var trans = ins.startTransaction()
        rejected(new SyntaxError('foo'))
          .then(function () {
            t.fail('should not resolve')
          })[fnName](TypeError, function () {
            t.fail('should not catch a TypeError')
          })[fnName](ReferenceError, function () {
            t.fail('should not catch a ReferenceError')
          })[fnName](function (err) {
            t.ok(err instanceof SyntaxError)
            t.equal(err.message, 'foo')
            t.equal(ins.currentTransaction._uuid, trans._uuid)
          })
      })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, multi, first type)', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected(new SyntaxError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](TypeError, SyntaxError, function (err) {
          t.ok(err instanceof SyntaxError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](ReferenceError, RangeError, function () {
          t.fail('should not catch a ReferenceError or RangeError')
        })[fnName](function () {
          t.fail('should not catch a generic error')
        })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, multi, second type)', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected(new RangeError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](TypeError, SyntaxError, function () {
          t.fail('should not catch a TypeError')
        })[fnName](ReferenceError, RangeError, function (err) {
          t.ok(err instanceof RangeError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](function () {
          t.fail('should not catch a generic error')
        })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, multi, catch-all)', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected(new URIError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](TypeError, SyntaxError, function () {
          t.fail('should not catch a TypeError')
        })[fnName](ReferenceError, RangeError, function () {
          t.fail('should not catch a ReferenceError')
        })[fnName](function (err) {
          t.ok(err instanceof URIError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('new Promise -> reject -> ' + fnName + ' (filtered, predicate)', function (t) {
    t.plan(18)
    twice(function () {
      var trans = ins.startTransaction()

      rejected(new URIError('foo'))
        .then(function () {
          t.fail('should not resolve')
        })[fnName](PredicateTestNoMatch, function () {
          t.fail('should not reject if predicate doesn\'t match')
        })[fnName](PredicateTestMatch, function (err) {
          t.ok(err instanceof URIError)
          t.equal(err.message, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](function () {
          t.fail('should not catch a generic error')
        })

      function PredicateTestNoMatch (err) {
        t.ok(err instanceof URIError)
        t.equal(err.message, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return false
      }

      function PredicateTestMatch (err) {
        t.ok(err instanceof URIError)
        t.equal(err.message, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
        return true
      }
    })
  })

  if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
    test('new Promise -> reject -> ' + fnName + ' (filtered, predicate shorthand)', function (t) {
      t.plan(6)
      twice(function () {
        var trans = ins.startTransaction()
        var err = new URIError('foo')
        err.code = 42
        rejected(err)
          .then(function () {
            t.fail('should not resolve')
          })[fnName]({code: 41}, function () {
            t.fail('should not reject if predicate doesn\'t match')
          })[fnName]({code: 42}, function (err) {
            t.ok(err instanceof URIError)
            t.equal(err.message, 'foo')
            t.equal(ins.currentTransaction._uuid, trans._uuid)
          })[fnName](function () {
            t.fail('should not catch a generic error')
          })
      })
    })
  }
})

test('new Promise -> reject -> error', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    rejected(new Promise.OperationalError('foo'))
      .then(function () {
        t.fail('should not resolve')
      }).error(function (err) {
        t.ok(err instanceof Promise.OperationalError)
        t.equal(err.message, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not call catch')
      })
  })
})

var FINALLY_NAMES = ['finally', 'lastly']
FINALLY_NAMES.forEach(function (fnName) {
  test('new Promise -> reject -> ' + fnName, function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      rejected('foo')
        .then(function () {
          t.fail('should not resolve')
        })[fnName](function () {
          t.ok('should call ' + fnName)
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('new Promise -> reject -> catch -> ' + fnName, function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      rejected('foo')
        .then(function () {
          t.fail('should not resolve')
        }).catch(function (err) {
          t.equal(err, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](function () {
          t.ok('should call ' + fnName)
        })
    })
  })

  test('new Promise -> reject -> then -> catch -> ' + fnName + ' -> new Promise -> then', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      rejected('foo')
        .then(function () {
          t.fail('should not resolve')
        }).catch(function (err) {
          t.equal(err, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName](function () {
          t.ok('should call ' + fnName)
          return resolved('bar')
        }).then(function (result) {
          t.equal(result, undefined)
        })
    })
  })

  test('new Promise -> resolve -> then -> ' + fnName + ' -> new Promise -> then', function (t) {
    t.plan(10)
    twice(function () {
      var trans = ins.startTransaction()
      var finallyCalled = false
      resolved('foo')
        .then(function (result) {
          t.equal(result, 'foo')
        }).catch(function () {
          t.fail('should not reject')
        })[fnName](function () {
          finallyCalled = true
          t.ok('should call ' + fnName)
          return resolved('bar')
        }).then(function (result) {
          t.ok(finallyCalled)
          t.equal(result, undefined)
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('new Promise -> resolve -> ' + fnName + ' -> new Promise -> then', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      var finallyCalled = false
      resolved('foo')
        .catch(function () {
          t.fail('should not reject')
        })[fnName](function () {
          finallyCalled = true
          t.ok('should call ' + fnName)
          return resolved('bar')
        }).then(function (result) {
          t.ok(finallyCalled)
          t.equal(result, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })
})

test('new Promise -> bind -> then', function (t) {
  t.plan(6)

  function Obj () {}

  twice(function () {
    var trans = ins.startTransaction()
    var obj = new Obj()
    var n = obj.n = Math.random()

    resolved('foo')
      .bind(obj)
      .then(function (result) {
        t.equal(this.n, n)
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.0')) {
  test('Promise.bind - with value', function (t) {
    t.plan(6)

    function Obj () {}

    twice(function () {
      var trans = ins.startTransaction()
      var obj = new Obj()
      var n = obj.n = Math.random()

      var p = resolved('foo')

      p = Promise.bind(obj, p)

      p.then(function (result) {
        t.equal(this.n, n)
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })
}

test('Promise.bind - promise, without value', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p = resolved('foo')

    p = Promise.bind(p)

    p.then(function (result) {
      t.equal(result, undefined)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.bind - non-promise, without value', function (t) {
  t.plan(6)

  function Obj () {}

  twice(function () {
    var trans = ins.startTransaction()
    var obj = new Obj()
    var n = obj.n = Math.random()

    var p = Promise.bind(obj)

    p.then(function (result) {
      t.equal(this.n, n)
      t.equal(result, undefined)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.join', function (t) {
  t.plan(8)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = resolved('p1')
    var p2 = resolved('p2')
    var p3 = resolved('p3')

    Promise.join(p1, p2, p3, function (a, b, c) {
      t.equal(a, 'p1')
      t.equal(b, 'p2')
      t.equal(c, 'p3')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

var TRY_NAMES = ['try', 'attempt']
TRY_NAMES.forEach(function (fnName) {
  test('Promise.' + fnName + ' -> return value', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      Promise[fnName](function () {
        return 'foo'
      }).then(function (result) {
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })
    })
  })

  test('Promise.' + fnName + ' -> throw', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      Promise[fnName](function () {
        throw new Error('foo')
      }).then(function () {
        t.fail('should not resolve')
      }).catch(function (err) {
        t.equal(err.message, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('Promise.' + fnName + ' with args value', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      Promise[fnName](function (value) {
        t.equal(value, 'bar')
        return 'foo'
      }, 'bar').then(function (result) {
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })
    })
  })

  test('Promise.' + fnName + ' with args array', function (t) {
    t.plan(6)
    twice(function () {
      var trans = ins.startTransaction()
      Promise[fnName](function () {
        t.deepEqual([].slice.call(arguments), [1, 2, 3])
        return 'foo'
      }, [1, 2, 3]).then(function (result) {
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })
    })
  })

  test('Promise.' + fnName + ' with context', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      var obj = {}
      Promise[fnName](function (value) {
        t.equal(value, undefined)
        t.equal(this, obj)
        return 'foo'
      }, undefined, obj).then(function (result) {
        t.equal(result, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })
    })
  })
})

test('Promise.method -> return value', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.method(function () {
      return 'foo'
    })().then(function (result) {
      t.equal(result, 'foo')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    }).catch(function () {
      t.fail('should not reject')
    })
  })
})

test('Promise.method -> throw', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.method(function () {
      throw new Error('foo')
    })().then(function () {
      t.fail('should not resolve')
    }).catch(function (err) {
      t.equal(err.message, 'foo')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.all', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = resolved('p1')
    var p2 = resolved('p2')
    var p3 = resolved('p3')

    Promise.all([p1, p2, p3]).then(function (result) {
      t.deepEqual(result, ['p1', 'p2', 'p3'])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> all', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = resolved('p1')
    var p2 = resolved('p2')
    var p3 = resolved('p3')

    resolved([p1, p2, p3]).all().then(function (result) {
      t.deepEqual(result, ['p1', 'p2', 'p3'])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.props', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var props = {
      p1: resolved('p1'),
      p2: resolved('p2'),
      p3: resolved('p3')
    }

    Promise.props(props).then(function (result) {
      t.deepEqual(result, {p1: 'p1', p2: 'p2', p3: 'p3'})
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> props', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var props = {
      p1: resolved('p1'),
      p2: resolved('p2'),
      p3: resolved('p3')
    }

    resolved(props).props().then(function (result) {
      t.deepEqual(result, {p1: 'p1', p2: 'p2', p3: 'p3'})
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.any', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1')
      }, 20)
    })
    var p2 = rejected('p2')
    var p3 = resolved('p3')

    Promise.any([p1, p2, p3]).then(function (result) {
      t.equal(result, 'p3')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> any', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1')
      }, 20)
    })
    var p2 = rejected('p2')
    var p3 = resolved('p3')

    resolved([p1, p2, p3]).any().then(function (result) {
      t.equal(result, 'p3')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.some', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1')
      }, 20)
    })
    var p2 = resolved('p2')
    var p3 = rejected('p3')
    var p4 = resolved('p4')

    Promise.some([p1, p2, p3, p4], 2).then(function (result) {
      t.deepEqual(result, ['p2', 'p4'])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> some', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1')
      }, 20)
    })
    var p2 = resolved('p2')
    var p3 = rejected('p3')
    var p4 = resolved('p4')

    resolved([p1, p2, p3, p4]).some(2).then(function (result) {
      t.deepEqual(result, ['p2', 'p4'])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.map', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    Promise.map([1, 2, 3], function (value) {
      return resolved(value)
    }).then(function (result) {
      t.deepEqual(result, [1, 2, 3])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> map', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    resolved([1, 2, 3]).map(function (value) {
      return resolved(value)
    }).then(function (result) {
      t.deepEqual(result, [1, 2, 3])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.reduce', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    Promise.reduce([1, 2, 3], function (total, value) {
      return new Promise(function (resolve, reject) {
        setImmediate(function () {
          resolve(total + value)
        })
      })
    }, 36).then(function (result) {
      t.equal(result, 42)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> reduce', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    resolved([1, 2, 3]).reduce(function (total, value) {
      return new Promise(function (resolve, reject) {
        setImmediate(function () {
          resolve(total + value)
        })
      })
    }, 36).then(function (result) {
      t.equal(result, 42)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.filter', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    var arr = [resolved(1), resolved(2), resolved(3), resolved(4)]

    Promise.filter(arr, function (value) {
      return value > 2
    }).then(function (result) {
      t.deepEqual(result, [3, 4])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> filter', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    var arr = [resolved(1), resolved(2), resolved(3), resolved(4)]

    resolved(arr).filter(function (value) {
      return value > 2
    }).then(function (result) {
      t.deepEqual(result, [3, 4])
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

// WARNING: this test is flaky on bluebird@2 unless bluebird.each is shimmed.
// If you remove the shim, this test might still pass as it only fails once in
// a while
test('Promise.each', function (t) {
  t.plan(24)
  twice(function () {
    var trans = ins.startTransaction()
    var arr = [resolved(1), resolved(2), resolved(3)]
    var results = [1, 2, 3]

    Promise.each(arr, function (item, index, length) {
      var expected = results.shift()
      t.equal(item, expected)
      t.equal(index, expected - 1, 'index should be expected - 1')
      t.equal(length, 3, 'length should be 3')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

// WARNING: this test is flaky on bluebird@2 unless bluebird.prototype.each is
// shimmed. If you remove the shim, this test might still pass as it only fails
// once in a while
test('new Promise -> each', function (t) {
  t.plan(24)
  twice(function () {
    var trans = ins.startTransaction()
    var arr = [resolved(1), resolved(2), resolved(3)]
    var results = [1, 2, 3]

    resolved(arr).each(function (item, index, length) {
      var expected = results.shift()
      t.equal(item, expected)
      t.equal(index, expected - 1, 'index should be expected - 1')
      t.equal(length, 3, 'length should be 3')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
  test('Promise.mapSeries', function (t) {
    t.plan(24)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = resolved(1)
      var p2 = resolved(2)
      var p3 = resolved(3)
      var arr = [p2, p3, p1]
      var results = [2, 3, 1]
      var i = 0

      Promise.mapSeries(arr, function (item, index, length) {
        var expected = results.shift()
        t.equal(item, expected)
        t.equal(index, i++)
        t.equal(length, 3, 'length should be 3')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })

  test('new Promise -> mapSeries', function (t) {
    t.plan(24)
    twice(function () {
      var trans = ins.startTransaction()
      var p1 = resolved(1)
      var p2 = resolved(2)
      var p3 = resolved(3)
      var arr = [p2, p3, p1]
      var results = [2, 3, 1]
      var i = 0

      resolved(arr).mapSeries(function (item, index, length) {
        var expected = results.shift()
        t.equal(item, expected)
        t.equal(index, i++)
        t.equal(length, 3, 'length should be 3')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })
}

test('Promise.using', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()

    Promise.using(getResource(), function (resource) {
      t.equal(resource, 'foo')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })

    function getResource () {
      return resolved('foo').disposer(function (resource) {
        t.equal(resource, 'foo')
      })
    }
  })
})

test('Promise.promisify', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    var readFile = Promise.promisify(require('fs').readFile)

    readFile(__filename, 'utf8').then(function (contents) {
      var firstLine = contents.split('\n')[0]
      t.equal(firstLine, '\'use strict\'')
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('Promise.promisifyAll', function (t) {
  t.plan(8)
  twice(function () {
    var trans = ins.startTransaction()

    var obj = {
      success: function (cb) {
        setImmediate(function () {
          cb(null, 'foo')
        })
      },
      failure: function (cb) {
        setImmediate(function () {
          cb(new Error('bar'))
        })
      }
    }

    Promise.promisifyAll(obj)

    obj.successAsync()
      .then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })

    obj.failureAsync()
      .then(function () {
        t.fail('should not resolve')
      }).catch(function (err) {
        t.equal(err.message, 'bar')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

var fromCallbackNames = []
if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.0')) fromCallbackNames.push('fromNode')
if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) fromCallbackNames.push('fromCallback')
fromCallbackNames.forEach(function (fnName) {
  test('Promise.' + fnName + ' - resolve', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()

      Promise[fnName](function (cb) {
        setImmediate(function () {
          cb(null, 'foo')
        })
      }).then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      }).catch(function () {
        t.fail('should not reject')
      })
    })
  })

  test('Promise.' + fnName + ' - reject', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()

      Promise[fnName](function (cb) {
        setImmediate(function () {
          cb(new Error('bar'))
        })
      }).then(function () {
        t.fail('should not resolve')
      }).catch(function (err) {
        t.equal(err.message, 'bar')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })
})

var asCallbackNames = ['nodeify']
if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.15')) asCallbackNames.push('asCallback')
asCallbackNames.forEach(function (fnName) {
  test('new Promise -> ' + fnName + ' (resolve)', function (t) {
    t.plan(10)
    twice(function () {
      var trans = ins.startTransaction()

      getSomething().then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })

      getSomething(function (err, value) {
        t.equal(err, null)
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })

      function getSomething (cb) {
        return resolved('foo')[fnName](cb)
      }
    })
  })

  test('new Promise -> ' + fnName + ' (reject)', function (t) {
    t.plan(10)
    twice(function () {
      var trans = ins.startTransaction()

      getSomething()
        .then(function () {
          t.fail('should not resolve')
        }).catch(function (err) {
          t.equal(err, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })

      getSomething(function (err, value) {
        t.equal(err, 'foo')
        t.equal(value, undefined)
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })

      function getSomething (cb) {
        return rejected('foo')[fnName](cb)
      }
    })
  })
})

test('Promise.delay', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    var start = Date.now()

    Promise.delay(50).then(function () {
      var expected = start + 49 // timings are hard
      var now = Date.now()
      t.ok(expected <= now, 'start + 49 should be <= ' + now + ' - was ' + expected)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> delay', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    var start = Date.now()

    Promise.resolve('foo').delay(50).then(function () {
      var expected = start + 49 // timings are hard
      var now = Date.now()
      t.ok(expected <= now, 'start + 49 should be <= ' + now + ' - was ' + expected)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> timeout (resolve in time)', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    resolved('foo')
      .timeout(50)
      .then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
      .catch(function () {
        t.fail('should not reject')
      })
  })
})

test('new Promise -> timeout (reject in time)', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()

    rejected('foo')
      .timeout(50)
      .then(function () {
        t.fail('should not resolve')
      })
      .catch(function (err) {
        t.equal(err, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

test('new Promise -> timeout (timed out)', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    var start = Date.now()

    new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('foo')
      }, 100)
    }).timeout(50).then(function () {
      t.fail('should not resolve')
    }).catch(function (err) {
      var expected = start + 49 // timings are hard
      var now = Date.now()
      t.ok(expected <= now, 'start + 49 should be <= ' + now + ' - was ' + expected)
      t.ok(err instanceof Promise.TimeoutError)
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

test('new Promise -> reject -> tap -> catch', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    rejected('foo')
      .tap(function () {
        t.fail('should not call tap')
      })
      .then(function () {
        t.fail('should not resolve')
      })
      .catch(function (err) {
        t.equal(err, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

test('new Promise -> resolve -> tap -> then (no return)', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    resolved('foo')
      .tap(function (value) {
        t.equal(value, 'foo')
      })
      .then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

test('new Promise -> resolve -> tap -> then (return)', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    resolved('foo')
      .tap(function (value) {
        t.equal(value, 'foo')
        return resolved('bar')
      })
      .then(function (value) {
        t.equal(value, 'foo')
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

test('new Promise -> call', function (t) {
  t.plan(8)
  twice(function () {
    var trans = ins.startTransaction()
    var obj = {
      foo: function (a, b) {
        t.equal(a, 1)
        t.equal(b, 2)
        return a + b
      }
    }
    resolved(obj)
      .call('foo', 1, 2)
      .then(function (value) {
        t.deepEqual(value, 3)
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

test('new Promise -> get', function (t) {
  t.plan(4)
  twice(function () {
    var trans = ins.startTransaction()
    resolved({foo: 42})
      .get('foo')
      .then(function (value) {
        t.deepEqual(value, 42)
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
  })
})

var RETURN_NAMES = ['return', 'thenReturn']
RETURN_NAMES.forEach(function (fnName) {
  test('new Promise -> ' + fnName, function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })[fnName]('bar')
        .then(function (value) {
          t.deepEqual(value, 'bar')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })
})

var THROW_NAMES = ['throw', 'thenThrow']
THROW_NAMES.forEach(function (fnName) {
  test('new Promise -> ' + fnName, function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      resolved('foo')[fnName](new Error('bar'))
        .then(function () {
          t.fail('should not resolve')
        })
        .catch(function (err) {
          t.deepEqual(err.message, 'bar')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })
})

if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
  test('new Promise -> resolve -> catchReturn', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catchReturn('bar')
        .then(function (value) {
          t.deepEqual(value, undefined)
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('new Promise -> reject -> catchReturn', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      rejected('foo')
        .then(function () {
          t.fail('should not resolve')
        })
        .catchReturn('bar')
        .then(function (value) {
          t.deepEqual(value, 'bar')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })

  test('new Promise -> resolve -> catchThrow', function (t) {
    t.plan(8)
    twice(function () {
      var trans = ins.startTransaction()
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catchThrow(new Error('bar'))
        .then(function (value) {
          t.deepEqual(value, undefined)
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
        .catch(function () {
          t.fail('should not reject')
        })
    })
  })

  test('new Promise -> reject -> catchThrow', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      rejected('foo')
        .then(function () {
          t.fail('should not resolve')
        })
        .catchThrow(new Error('bar'))
        .then(function () {
          t.fail('should not resolve')
        })
        .catch(function (err) {
          t.deepEqual(err.message, 'bar')
          t.equal(ins.currentTransaction._uuid, trans._uuid)
        })
    })
  })
}

if (semver.satisfies(BLUEBIRD_VERSION, '>=2.3.6')) {
  test('new Promise -> reflect', function (t) {
    t.plan(4)
    twice(function () {
      var trans = ins.startTransaction()
      resolved('foo').reflect().then(function (p) {
        t.ok(p.isFulfilled())
        t.equal(ins.currentTransaction._uuid, trans._uuid)
      })
    })
  })
}

test('new Promise -> settle', function (t) {
  t.plan(6)
  twice(function () {
    var trans = ins.startTransaction()
    Promise.settle([resolved('foo')]).then(function (result) {
      t.equal(result.length, 1)
      t.ok(result[0].isFulfilled())
      t.equal(ins.currentTransaction._uuid, trans._uuid)
    })
  })
})

function twice (fn) {
  setImmediate(fn)
  setImmediate(fn)
}

function resolved (value) {
  return new Promise(function (resolve, reject) {
    processAsync(resolve, value)
  })
}

function rejected (value) {
  return new Promise(function (resolve, reject) {
    processAsync(reject, value)
  })
}

function processAsync (handler, value) {
  setImmediate(function () {
    handler(value)
  })
}
