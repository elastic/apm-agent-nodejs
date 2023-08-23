/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const kOrigFunction = Symbol('kOrigFunction');

class SpyObject {
  /**
   * @type {any[][]}
   */
  calls = [];

  /**
   * Tells if the spied function has been called. If a positive number
   * is passed checks if it's equal to the times it has been called
   *
   * @param {Number} [times=1] - To check for specific number of calls
   * @returns {Boolean}
   */
  hasBeenCalled(times) {
    const t = typeof times === 'number' ? times : 1;

    return this.calls.length === t;
  }
}

/**
 * Returns an object with data about the usage of the spied method
 *
 * @param {any} test the test where the spy is created
 * @param {Object} target the object which holds the method to spy
 * @param {String} method the method to spy on
 * @returns {SpyObject} object with usage data
 */
function spyOn(test, target, method) {
  if (!target || !method) {
    throw Error('spyOn: target or method not defined');
  }
  if (!target[method]) {
    throw Error(`spyOn: method ${method} is not defined on target`);
  }
  if (typeof target[method] !== 'function') {
    throw Error(`spyOn: method ${method} is not a function`);
  }
  if (typeof target[method][kOrigFunction] === 'function') {
    throw Error(`spyOn: method ${method} is already used`);
  }

  const orig = target[method];
  const spy = new SpyObject();
  const wrap = function () {
    spy.calls.push([].slice.call(arguments));
    return orig.apply(this, arguments);
  };
  wrap[kOrigFunction] = orig;
  target[method] = wrap;

  // Restore when test finished
  test.teardown(function () {
    if (target[method][kOrigFunction]) {
      target[method] = target[method][kOrigFunction];
    }
  });

  return spy;
}

module.exports = {
  spyOn,
};
