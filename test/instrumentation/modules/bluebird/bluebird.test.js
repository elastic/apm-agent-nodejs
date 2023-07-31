/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

// The unhandledRejection will be fired by our bluebird tests, which is to be
// expected.
require('../../../_promise_rejection').remove();

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

var BLUEBIRD_VERSION = require('bluebird/package').version;
var Promise = require('bluebird');
var semver = require('semver');
var test = require('tape');

var ins = agent._instrumentation;

require('../../_shared-promise-tests')(test, Promise, ins);
require('./_coroutine')(test, Promise, ins);

test('Promise.prototype.spread - all formal', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.all(['foo', 'bar']).spread(function (a, b) {
      t.strictEqual(a, 'foo');
      t.strictEqual(b, 'bar');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('Promise.prototype.spread - all promises', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    var arr = [resolved('foo'), resolved('bar')];
    Promise.all(arr).spread(function (a, b) {
      t.strictEqual(a, 'foo');
      t.strictEqual(b, 'bar');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('Promise.prototype.spread - then formal', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.delay(1)
      .then(function () {
        return ['foo', 'bar'];
      })
      .spread(function (a, b) {
        t.strictEqual(a, 'foo');
        t.strictEqual(b, 'bar');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.prototype.spread - then promises', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.delay(1)
      .then(function () {
        return [resolved('foo'), resolved('bar')];
      })
      .spread(function (a, b) {
        t.strictEqual(a, 'foo');
        t.strictEqual(b, 'bar');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

var CATCH_NAMES = ['catch', 'caught'];
CATCH_NAMES.forEach(function (fnName) {
  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, first type)',
    function (t) {
      t.plan(6);
      twice(function () {
        var trans = ins.startTransaction();
        rejected(new TypeError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](TypeError, function (err) {
            t.ok(err instanceof TypeError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](ReferenceError, function () {
            t.fail('should not catch a ReferenceError');
          })
          [fnName](function () {
            t.fail('should not catch a generic error');
          });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, second type)',
    function (t) {
      t.plan(6);
      twice(function () {
        var trans = ins.startTransaction();
        rejected(new ReferenceError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](TypeError, function () {
            t.fail('should not catch a TypeError');
          })
          [fnName](ReferenceError, function (err) {
            t.ok(err instanceof ReferenceError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](function () {
            t.fail('should not catch a generic error');
          });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, catch-all)',
    function (t) {
      t.plan(6);
      twice(function () {
        setImmediate(function () {
          var trans = ins.startTransaction();
          rejected(new SyntaxError('foo'))
            .then(function () {
              t.fail('should not resolve');
            })
            [fnName](TypeError, function () {
              t.fail('should not catch a TypeError');
            })
            [fnName](ReferenceError, function () {
              t.fail('should not catch a ReferenceError');
            })
            [fnName](function (err) {
              t.ok(err instanceof SyntaxError);
              t.strictEqual(err.message, 'foo');
              t.strictEqual(ins.currTransaction().id, trans.id);
            });
        });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, multi, first type)',
    function (t) {
      t.plan(6);
      twice(function () {
        var trans = ins.startTransaction();
        rejected(new SyntaxError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](TypeError, SyntaxError, function (err) {
            t.ok(err instanceof SyntaxError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](ReferenceError, RangeError, function () {
            t.fail('should not catch a ReferenceError or RangeError');
          })
          [fnName](function () {
            t.fail('should not catch a generic error');
          });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, multi, second type)',
    function (t) {
      t.plan(6);
      twice(function () {
        var trans = ins.startTransaction();
        rejected(new RangeError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](TypeError, SyntaxError, function () {
            t.fail('should not catch a TypeError');
          })
          [fnName](ReferenceError, RangeError, function (err) {
            t.ok(err instanceof RangeError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](function () {
            t.fail('should not catch a generic error');
          });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, multi, catch-all)',
    function (t) {
      t.plan(6);
      twice(function () {
        var trans = ins.startTransaction();
        rejected(new URIError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](TypeError, SyntaxError, function () {
            t.fail('should not catch a TypeError');
          })
          [fnName](ReferenceError, RangeError, function () {
            t.fail('should not catch a ReferenceError');
          })
          [fnName](function (err) {
            t.ok(err instanceof URIError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          });
      });
    },
  );

  test(
    'new Promise -> reject -> ' + fnName + ' (filtered, predicate)',
    function (t) {
      t.plan(18);
      twice(function () {
        var trans = ins.startTransaction();

        rejected(new URIError('foo'))
          .then(function () {
            t.fail('should not resolve');
          })
          [fnName](PredicateTestNoMatch, function () {
            t.fail("should not reject if predicate doesn't match");
          })
          [fnName](PredicateTestMatch, function (err) {
            t.ok(err instanceof URIError);
            t.strictEqual(err.message, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](function () {
            t.fail('should not catch a generic error');
          });

        function PredicateTestNoMatch(err) {
          t.ok(err instanceof URIError);
          t.strictEqual(err.message, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
          return false;
        }

        function PredicateTestMatch(err) {
          t.ok(err instanceof URIError);
          t.strictEqual(err.message, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
          return true;
        }
      });
    },
  );

  if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
    test(
      'new Promise -> reject -> ' + fnName + ' (filtered, predicate shorthand)',
      function (t) {
        t.plan(6);
        twice(function () {
          var trans = ins.startTransaction();
          var err = new URIError('foo');
          err.code = 42;
          rejected(err)
            .then(function () {
              t.fail('should not resolve');
            })
            [fnName]({ code: 41 }, function () {
              t.fail("should not reject if predicate doesn't match");
            })
            [fnName]({ code: 42 }, function (err) {
              t.ok(err instanceof URIError);
              t.strictEqual(err.message, 'foo');
              t.strictEqual(ins.currTransaction().id, trans.id);
            })
            [fnName](function () {
              t.fail('should not catch a generic error');
            });
        });
      },
    );
  }
});

test('new Promise -> reject -> error', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    rejected(new Promise.OperationalError('foo'))
      .then(function () {
        t.fail('should not resolve');
      })
      .error(function (err) {
        t.ok(err instanceof Promise.OperationalError);
        t.strictEqual(err.message, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      })
      .catch(function () {
        t.fail('should not call catch');
      });
  });
});

var FINALLY_NAMES = ['finally', 'lastly'];
FINALLY_NAMES.forEach(function (fnName) {
  test('new Promise -> reject -> ' + fnName, function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      rejected('foo')
        .then(function () {
          t.fail('should not resolve');
        })
        [fnName](function () {
          t.ok('should call ' + fnName);
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });

  test('new Promise -> reject -> catch -> ' + fnName, function (t) {
    t.plan(6);
    twice(function () {
      var trans = ins.startTransaction();
      rejected('foo')
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.strictEqual(err, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        [fnName](function () {
          t.ok('should call ' + fnName);
        });
    });
  });

  test(
    'new Promise -> reject -> then -> catch -> ' +
      fnName +
      ' -> new Promise -> then',
    function (t) {
      t.plan(8);
      twice(function () {
        var trans = ins.startTransaction();
        rejected('foo')
          .then(function () {
            t.fail('should not resolve');
          })
          .catch(function (err) {
            t.strictEqual(err, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          })
          [fnName](function () {
            t.ok('should call ' + fnName);
            return resolved('bar');
          })
          .then(function (result) {
            t.strictEqual(result, undefined);
          });
      });
    },
  );

  test(
    'new Promise -> resolve -> then -> ' + fnName + ' -> new Promise -> then',
    function (t) {
      t.plan(10);
      twice(function () {
        var trans = ins.startTransaction();
        var finallyCalled = false;
        resolved('foo')
          .then(function (result) {
            t.strictEqual(result, 'foo');
          })
          .catch(function () {
            t.fail('should not reject');
          })
          [fnName](function () {
            finallyCalled = true;
            t.ok('should call ' + fnName);
            return resolved('bar');
          })
          .then(function (result) {
            t.ok(finallyCalled);
            t.strictEqual(result, undefined);
            t.strictEqual(ins.currTransaction().id, trans.id);
          });
      });
    },
  );

  test(
    'new Promise -> resolve -> ' + fnName + ' -> new Promise -> then',
    function (t) {
      t.plan(8);
      twice(function () {
        var trans = ins.startTransaction();
        var finallyCalled = false;
        resolved('foo')
          .catch(function () {
            t.fail('should not reject');
          })
          [fnName](function () {
            finallyCalled = true;
            t.ok('should call ' + fnName);
            return resolved('bar');
          })
          .then(function (result) {
            t.ok(finallyCalled);
            t.strictEqual(result, 'foo');
            t.strictEqual(ins.currTransaction().id, trans.id);
          });
      });
    },
  );
});

test('new Promise -> bind -> then', function (t) {
  t.plan(6);

  function Obj() {}

  twice(function () {
    var trans = ins.startTransaction();
    var obj = new Obj();
    var n = (obj.n = Math.random());

    resolved('foo')
      .bind(obj)
      .then(function (result) {
        t.strictEqual(this.n, n);
        t.strictEqual(result, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.0')) {
  test('Promise.bind - with value', function (t) {
    t.plan(6);

    function Obj() {}

    twice(function () {
      var trans = ins.startTransaction();
      var obj = new Obj();
      var n = (obj.n = Math.random());

      var p = resolved('foo');

      p = Promise.bind(obj, p);

      p.then(function (result) {
        t.strictEqual(this.n, n);
        t.strictEqual(result, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });
}

test('Promise.bind - promise, without value', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p = resolved('foo');

    p = Promise.bind(p);

    p.then(function (result) {
      t.strictEqual(result, undefined);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('Promise.bind - non-promise, without value', function (t) {
  t.plan(6);

  function Obj() {}

  twice(function () {
    var trans = ins.startTransaction();
    var obj = new Obj();
    var n = (obj.n = Math.random());

    var p = Promise.bind(obj);

    p.then(function (result) {
      t.strictEqual(this.n, n);
      t.strictEqual(result, undefined);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('Promise.join', function (t) {
  t.plan(8);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = resolved('p1');
    var p2 = resolved('p2');
    var p3 = resolved('p3');

    Promise.join(p1, p2, p3, function (a, b, c) {
      t.strictEqual(a, 'p1');
      t.strictEqual(b, 'p2');
      t.strictEqual(c, 'p3');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

var TRY_NAMES = ['try', 'attempt'];
TRY_NAMES.forEach(function (fnName) {
  test('Promise.' + fnName + ' -> return value', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      Promise[fnName](function () {
        return 'foo';
      })
        .then(function (result) {
          t.strictEqual(result, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('Promise.' + fnName + ' -> throw', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      Promise[fnName](function () {
        throw new Error('foo');
      })
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.strictEqual(err.message, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });

  test('Promise.' + fnName + ' with args value', function (t) {
    t.plan(6);
    twice(function () {
      var trans = ins.startTransaction();
      Promise[fnName](function (value) {
        t.strictEqual(value, 'bar');
        return 'foo';
      }, 'bar')
        .then(function (result) {
          t.strictEqual(result, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('Promise.' + fnName + ' with args array', function (t) {
    t.plan(6);
    twice(function () {
      var trans = ins.startTransaction();
      Promise[fnName](
        function () {
          t.deepEqual([].slice.call(arguments), [1, 2, 3]);
          return 'foo';
        },
        [1, 2, 3],
      )
        .then(function (result) {
          t.strictEqual(result, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('Promise.' + fnName + ' with context', function (t) {
    t.plan(8);
    twice(function () {
      var trans = ins.startTransaction();
      var obj = {};
      Promise[fnName](
        function (value) {
          t.strictEqual(value, undefined);
          t.strictEqual(this, obj);
          return 'foo';
        },
        undefined,
        obj,
      )
        .then(function (result) {
          t.strictEqual(result, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });
});

test('Promise.method -> return value', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.method(function () {
      return 'foo';
    })()
      .then(function (result) {
        t.strictEqual(result, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      })
      .catch(function () {
        t.fail('should not reject');
      });
  });
});

test('Promise.method -> throw', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.method(function () {
      throw new Error('foo');
    })()
      .then(function () {
        t.fail('should not resolve');
      })
      .catch(function (err) {
        t.strictEqual(err.message, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.all', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = resolved('p1');
    var p2 = resolved('p2');
    var p3 = resolved('p3');

    Promise.all([p1, p2, p3]).then(function (result) {
      t.deepEqual(result, ['p1', 'p2', 'p3']);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> all', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = resolved('p1');
    var p2 = resolved('p2');
    var p3 = resolved('p3');

    resolved([p1, p2, p3])
      .all()
      .then(function (result) {
        t.deepEqual(result, ['p1', 'p2', 'p3']);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.props', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var props = {
      p1: resolved('p1'),
      p2: resolved('p2'),
      p3: resolved('p3'),
    };

    Promise.props(props).then(function (result) {
      t.deepEqual(result, { p1: 'p1', p2: 'p2', p3: 'p3' });
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> props', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var props = {
      p1: resolved('p1'),
      p2: resolved('p2'),
      p3: resolved('p3'),
    };

    resolved(props)
      .props()
      .then(function (result) {
        t.deepEqual(result, { p1: 'p1', p2: 'p2', p3: 'p3' });
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.any', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1');
      }, 100);
    });
    var p2 = rejected('p2');
    var p3 = resolved('p3');

    Promise.any([p1, p2, p3]).then(function (result) {
      t.strictEqual(result, 'p3');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> any', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1');
      }, 100);
    });
    var p2 = rejected('p2');
    var p3 = resolved('p3');

    resolved([p1, p2, p3])
      .any()
      .then(function (result) {
        t.strictEqual(result, 'p3');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.some', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1');
      }, 100);
    });
    var p2 = resolved('p2');
    var p3 = rejected('p3');
    var p4 = resolved('p4');

    Promise.some([p1, p2, p3, p4], 2).then(function (result) {
      t.deepEqual(result, ['p2', 'p4']);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> some', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    var p1 = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('p1');
      }, 100);
    });
    var p2 = resolved('p2');
    var p3 = rejected('p3');
    var p4 = resolved('p4');

    resolved([p1, p2, p3, p4])
      .some(2)
      .then(function (result) {
        t.deepEqual(result, ['p2', 'p4']);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.map', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    Promise.map([1, 2, 3], function (value) {
      return resolved(value);
    }).then(function (result) {
      t.deepEqual(result, [1, 2, 3]);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> map', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    resolved([1, 2, 3])
      .map(function (value) {
        return resolved(value);
      })
      .then(function (result) {
        t.deepEqual(result, [1, 2, 3]);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.reduce', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    Promise.reduce(
      [1, 2, 3],
      function (total, value) {
        return new Promise(function (resolve, reject) {
          setImmediate(function () {
            resolve(total + value);
          });
        });
      },
      36,
    ).then(function (result) {
      t.strictEqual(result, 42);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> reduce', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    resolved([1, 2, 3])
      .reduce(function (total, value) {
        return new Promise(function (resolve, reject) {
          setImmediate(function () {
            resolve(total + value);
          });
        });
      }, 36)
      .then(function (result) {
        t.strictEqual(result, 42);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('Promise.filter', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    var arr = [resolved(1), resolved(2), resolved(3), resolved(4)];

    Promise.filter(arr, function (value) {
      return value > 2;
    }).then(function (result) {
      t.deepEqual(result, [3, 4]);
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> filter', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    var arr = [resolved(1), resolved(2), resolved(3), resolved(4)];

    resolved(arr)
      .filter(function (value) {
        return value > 2;
      })
      .then(function (result) {
        t.deepEqual(result, [3, 4]);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

// WARNING: this test is flaky on bluebird@2 unless bluebird.each is shimmed.
// If you remove the shim, this test might still pass as it only fails once in
// a while
test('Promise.each', function (t) {
  t.plan(24);
  twice(function () {
    var trans = ins.startTransaction();
    var arr = [resolved(1), resolved(2), resolved(3)];
    var results = [1, 2, 3];

    Promise.each(arr, function (item, index, length) {
      var expected = results.shift();
      t.strictEqual(item, expected);
      t.strictEqual(index, expected - 1, 'index should be expected - 1');
      t.strictEqual(length, 3, 'length should be 3');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

// WARNING: this test is flaky on bluebird@2 unless bluebird.prototype.each is
// shimmed. If you remove the shim, this test might still pass as it only fails
// once in a while
test('new Promise -> each', function (t) {
  t.plan(24);
  twice(function () {
    var trans = ins.startTransaction();
    var arr = [resolved(1), resolved(2), resolved(3)];
    var results = [1, 2, 3];

    resolved(arr).each(function (item, index, length) {
      var expected = results.shift();
      t.strictEqual(item, expected);
      t.strictEqual(index, expected - 1, 'index should be expected - 1');
      t.strictEqual(length, 3, 'length should be 3');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
  test('Promise.mapSeries', function (t) {
    t.plan(24);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = resolved(1);
      var p2 = resolved(2);
      var p3 = resolved(3);
      var arr = [p2, p3, p1];
      var results = [2, 3, 1];
      var i = 0;

      Promise.mapSeries(arr, function (item, index, length) {
        var expected = results.shift();
        t.strictEqual(item, expected);
        t.strictEqual(index, i++);
        t.strictEqual(length, 3, 'length should be 3');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });

  test('new Promise -> mapSeries', function (t) {
    t.plan(24);
    twice(function () {
      var trans = ins.startTransaction();
      var p1 = resolved(1);
      var p2 = resolved(2);
      var p3 = resolved(3);
      var arr = [p2, p3, p1];
      var results = [2, 3, 1];
      var i = 0;

      resolved(arr).mapSeries(function (item, index, length) {
        var expected = results.shift();
        t.strictEqual(item, expected);
        t.strictEqual(index, i++);
        t.strictEqual(length, 3, 'length should be 3');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });
}

test('Promise.using', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();

    Promise.using(getResource(), function (resource) {
      t.strictEqual(resource, 'foo');
      t.strictEqual(ins.currTransaction().id, trans.id);
    });

    function getResource() {
      return resolved('foo').disposer(function (resource) {
        t.strictEqual(resource, 'foo');
      });
    }
  });
});

test('Promise.promisify', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    var readFile = Promise.promisify(require('fs').readFile);

    readFile(__filename, 'utf8').then(function (contents) {
      var firstLine = contents.split('\n')[0];
      t.strictEqual(firstLine, '/*', 'firstLine');
      t.strictEqual(
        ins.currTransaction().id,
        trans.id,
        'currentTransaction().id',
      );
    });
  });
});

test('Promise.promisifyAll', function (t) {
  t.plan(8);
  twice(function () {
    var trans = ins.startTransaction();

    var obj = {
      success(cb) {
        setImmediate(function () {
          cb(null, 'foo');
        });
      },
      failure(cb) {
        setImmediate(function () {
          cb(new Error('bar'));
        });
      },
    };

    Promise.promisifyAll(obj);

    obj
      .successAsync()
      .then(function (value) {
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      })
      .catch(function () {
        t.fail('should not reject');
      });

    obj
      .failureAsync()
      .then(function () {
        t.fail('should not resolve');
      })
      .catch(function (err) {
        t.strictEqual(err.message, 'bar');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

var fromCallbackNames = [];
if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.0'))
  fromCallbackNames.push('fromNode');
if (semver.satisfies(BLUEBIRD_VERSION, '>=3'))
  fromCallbackNames.push('fromCallback');
fromCallbackNames.forEach(function (fnName) {
  test('Promise.' + fnName + ' - resolve', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();

      Promise[fnName](function (cb) {
        setImmediate(function () {
          cb(null, 'foo');
        });
      })
        .then(function (value) {
          t.strictEqual(value, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('Promise.' + fnName + ' - reject', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();

      Promise[fnName](function (cb) {
        setImmediate(function () {
          cb(new Error('bar'));
        });
      })
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.strictEqual(err.message, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
});

var asCallbackNames = ['nodeify'];
if (semver.satisfies(BLUEBIRD_VERSION, '>=2.9.15'))
  asCallbackNames.push('asCallback');
asCallbackNames.forEach(function (fnName) {
  test('new Promise -> ' + fnName + ' (resolve)', function (t) {
    t.plan(10);
    twice(function () {
      var trans = ins.startTransaction();

      getSomething().then(function (value) {
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });

      getSomething(function (err, value) {
        t.strictEqual(err, null);
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });

      function getSomething(cb) {
        return resolved('foo')[fnName](cb);
      }
    });
  });

  test('new Promise -> ' + fnName + ' (reject)', function (t) {
    t.plan(10);
    twice(function () {
      var trans = ins.startTransaction();

      getSomething()
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.strictEqual(err, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });

      getSomething(function (err, value) {
        t.strictEqual(err, 'foo');
        t.strictEqual(value, undefined);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });

      function getSomething(cb) {
        return rejected('foo')[fnName](cb);
      }
    });
  });
});

test('Promise.delay', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    var start = Date.now();

    Promise.delay(50).then(function () {
      var expected = start + 49; // timings are hard
      var now = Date.now();
      t.ok(
        expected <= now,
        'start + 49 should be <= ' + now + ' - was ' + expected,
      );
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

test('new Promise -> delay', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    var start = Date.now();

    Promise.resolve('foo')
      .delay(50)
      .then(function () {
        var expected = start + 49; // timings are hard
        var now = Date.now();
        t.ok(
          expected <= now,
          'start + 49 should be <= ' + now + ' - was ' + expected,
        );
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> timeout (resolve in time)', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    resolved('foo')
      .timeout(50)
      .then(function (value) {
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      })
      .catch(function () {
        t.fail('should not reject');
      });
  });
});

test('new Promise -> timeout (reject in time)', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();

    rejected('foo')
      .timeout(50)
      .then(function () {
        t.fail('should not resolve');
      })
      .catch(function (err) {
        t.strictEqual(err, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> timeout (timed out)', function (t) {
  // Allowable number of ms of slop in the `.timeout(N)` actual time.
  // Anecdotally, I have seen +/- 6ms locally and in CI.
  const SLOP_MS = 10;

  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    var start = Date.now();

    new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve('foo');
      }, 100);
    })
      .timeout(50)
      .then(function () {
        t.fail('should not resolve');
      })
      .catch(function (err) {
        // You would think elapsed would always be >=50ms, but in busy CI I have
        // seen slightly *less than* 50ms.
        var elapsedMs = Date.now() - start;
        var diffMs = Math.abs(50 - elapsedMs);
        t.ok(
          diffMs <= SLOP_MS,
          `.timeout(50) resulted in 50 +/- ${SLOP_MS}, actual elapsed was ${elapsedMs}ms`,
        );
        t.ok(err instanceof Promise.TimeoutError, 'err');
        t.strictEqual(ins.currTransaction().id, trans.id, 'transaction.id');
      });
  });
});

test('new Promise -> reject -> tap -> catch', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    rejected('foo')
      .tap(function () {
        t.fail('should not call tap');
      })
      .then(function () {
        t.fail('should not resolve');
      })
      .catch(function (err) {
        t.strictEqual(err, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> resolve -> tap -> then (no return)', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    resolved('foo')
      .tap(function (value) {
        t.strictEqual(value, 'foo');
      })
      .then(function (value) {
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> resolve -> tap -> then (return)', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    resolved('foo')
      .tap(function (value) {
        t.strictEqual(value, 'foo');
        return resolved('bar');
      })
      .then(function (value) {
        t.strictEqual(value, 'foo');
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> call', function (t) {
  t.plan(8);
  twice(function () {
    var trans = ins.startTransaction();
    var obj = {
      foo(a, b) {
        t.strictEqual(a, 1);
        t.strictEqual(b, 2);
        return a + b;
      },
    };
    resolved(obj)
      .call('foo', 1, 2)
      .then(function (value) {
        t.deepEqual(value, 3);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

test('new Promise -> get', function (t) {
  t.plan(4);
  twice(function () {
    var trans = ins.startTransaction();
    resolved({ foo: 42 })
      .get('foo')
      .then(function (value) {
        t.deepEqual(value, 42);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
  });
});

var RETURN_NAMES = ['return', 'thenReturn'];
RETURN_NAMES.forEach(function (fnName) {
  test('new Promise -> ' + fnName, function (t) {
    t.plan(8);
    twice(function () {
      var trans = ins.startTransaction();
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        [fnName]('bar')
        .then(function (value) {
          t.deepEqual(value, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
});

var THROW_NAMES = ['throw', 'thenThrow'];
THROW_NAMES.forEach(function (fnName) {
  test('new Promise -> ' + fnName, function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      resolved('foo')
        [fnName](new Error('bar'))
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.deepEqual(err.message, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
});

if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
  test('new Promise -> resolve -> catchReturn', function (t) {
    t.plan(8);
    twice(function () {
      var trans = ins.startTransaction();
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catchReturn('bar')
        .then(function (value) {
          t.deepEqual(value, undefined);
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });

  test('new Promise -> reject -> catchReturn', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      rejected('foo')
        .then(function () {
          t.fail('should not resolve');
        })
        .catchReturn('bar')
        .then(function (value) {
          t.deepEqual(value, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });

  test('new Promise -> resolve -> catchThrow', function (t) {
    t.plan(8);
    twice(function () {
      var trans = ins.startTransaction();
      resolved('foo')
        .then(function (value) {
          t.deepEqual(value, 'foo');
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catchThrow(new Error('bar'))
        .then(function (value) {
          t.deepEqual(value, undefined);
          t.strictEqual(ins.currTransaction().id, trans.id);
        })
        .catch(function () {
          t.fail('should not reject');
        });
    });
  });

  test('new Promise -> reject -> catchThrow', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      rejected('foo')
        .then(function () {
          t.fail('should not resolve');
        })
        .catchThrow(new Error('bar'))
        .then(function () {
          t.fail('should not resolve');
        })
        .catch(function (err) {
          t.deepEqual(err.message, 'bar');
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
}

if (semver.satisfies(BLUEBIRD_VERSION, '>=2.3.6')) {
  test('new Promise -> reflect', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      resolved('foo')
        .reflect()
        .then(function (p) {
          t.ok(p.isFulfilled());
          t.strictEqual(ins.currTransaction().id, trans.id);
        });
    });
  });
}

test('new Promise -> settle', function (t) {
  t.plan(6);
  twice(function () {
    var trans = ins.startTransaction();
    Promise.settle([resolved('foo')]).then(function (result) {
      t.strictEqual(result.length, 1);
      t.ok(result[0].isFulfilled());
      t.strictEqual(ins.currTransaction().id, trans.id);
    });
  });
});

function twice(fn) {
  setImmediate(fn);
  setImmediate(fn);
}

function resolved(value) {
  return new Promise(function (resolve, reject) {
    processAsync(resolve, value);
  });
}

function rejected(value) {
  return new Promise(function (resolve, reject) {
    processAsync(reject, value);
  });
}

function processAsync(handler, value) {
  setImmediate(function () {
    handler(value);
  });
}
