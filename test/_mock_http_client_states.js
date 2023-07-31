/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = function (expectations = [], done) {
  return {
    _write(obj, cb) {
      cb = cb || (() => {});

      const type = Object.keys(obj)[0];

      for (let i = 0; i < expectations.length; i++) {
        const { find, test } = expectations[i];
        if (find(type, obj[type])) {
          test(obj[type]);
          expectations.splice(i, 1);
          if (!expectations.length) {
            done();
          }
          break;
        }
      }

      process.nextTick(cb);
    },
    sendSpan(span, cb) {
      this._write({ span }, cb);
    },
    sendTransaction(transaction, cb) {
      this._write({ transaction }, cb);
    },
    sendError(error, cb) {
      this._write({ error }, cb);
    },
    sendMetricSet(metricset, cb) {
      this._write({ metricset }, cb);
    },
    flush(opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      } else if (!opts) {
        opts = {};
      }
      if (cb) process.nextTick(cb);
    },
    supportsKeepingUnsampledTransaction() {
      return true;
    },
    supportsActivationMethodField() {
      return true;
    },
  };
};
