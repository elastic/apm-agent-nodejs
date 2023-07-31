/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = function (router) {
  router.get('/hello', async function (ctx, next) {
    ctx.body = 'hello world';
  });

  // create a catch all (.*) route to test that we handle that correctly
  router.use(async function (ctx, next) {
    await next();
  });

  router.get('/hello/:name', async function (ctx, next) {
    ctx.body = 'hello ' + ctx.params.name;
  });
};
