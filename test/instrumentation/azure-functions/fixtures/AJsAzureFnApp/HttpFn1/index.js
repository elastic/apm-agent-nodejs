/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function (context, _req) {
  context.res = {
    headers: {
      MyHeaderName: 'MyHeaderValue',
    },
    body: 'HttpFn1 body',
  };
};
