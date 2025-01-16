/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = function (context) {
  // This is an old (deprecated?) Azure Functions way to signal completion for
  // a non-async function handler.
  context.done(null, {
    res: {
      status: 202,
      body: 'HttpFnContextDone body',
    },
  });
};
