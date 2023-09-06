/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function (context) {
  // Using this wins over possible `context.res` usage.
  context.bindings.res = {
    status: 202,
    body: 'HttpFnBindingsRes body',
  };
};
