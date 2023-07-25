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

if (semver.satisfies(BLUEBIRD_VERSION, '>=3')) {
  Promise.config({ cancellation: true });

  var CANCEL_NAMES = ['cancel', 'break'];
  CANCEL_NAMES.forEach(function (fnName) {
    test('Promise.prototype.' + fnName, function (t) {
      t.plan(8);
      twice(function () {
        var trans = ins.startTransaction();
        var cancelled = false;
        var p = new Promise(function (resolve, reject, onCancel) {
          setTimeout(function () {
            resolve('foo');
          }, 100);

          t.strictEqual(
            ins.currTransaction().id,
            trans.id,
            'before calling onCancel',
          );

          onCancel(function () {
            t.ok(cancelled, 'should be cancelled');
            t.strictEqual(
              ins.currTransaction().id,
              trans.id,
              'onCancel callback',
            );
          });
        })
          .then(function () {
            t.fail('should not resolve');
          })
          .catch(function () {
            t.fail('should not reject');
          });

        setTimeout(function () {
          cancelled = true;
          t.strictEqual(ins.currTransaction().id, trans.id, 'before p.cancel');
          p[fnName]();
        }, 25);
      });
    });
  });
} else {
  test('Promise.prototype.cancel', function (t) {
    t.plan(4);
    twice(function () {
      var trans = ins.startTransaction();
      var p = new Promise(function () {}).cancellable();
      var err = new Error();
      p.cancel(err);
      p.then(t.fail, function (e) {
        t.strictEqual(e, err);
        t.strictEqual(ins.currTransaction().id, trans.id);
      });
    });
  });
}

function twice(fn) {
  setImmediate(fn);
  setImmediate(fn);
}
