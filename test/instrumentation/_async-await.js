/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

exports.promise = promise;
exports.nonPromise = nonPromise;

async function promise(delay) {
  var res = await promise2(delay);
  return res.toUpperCase();
}

async function promise2(delay) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve('success');
    }, delay);
  });
}

async function nonPromise() {
  var res = await 'success';
  return res.toUpperCase();
}
