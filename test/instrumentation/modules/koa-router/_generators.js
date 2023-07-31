/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = function (router) {
  router.get('/hello', function* (next) {
    this.body = 'hello world';
  });

  // create a catch all (.*) route to test that we handle that correctly
  router.use(function* (gen) {
    gen.next();
  });

  router.get('/hello/:name', function* (next) {
    this.body = 'hello ' + this.params.name;
  });
};
