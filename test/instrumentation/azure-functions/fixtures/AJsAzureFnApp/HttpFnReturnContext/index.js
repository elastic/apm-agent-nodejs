/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function () {
  // If returning an object with a field that matches the type=http "out"
  // binding, then this return value is used and wins over `context.res` and
  // `context.bindings.*` usage.
  // Note that this does *not* use a '$return' binding in function.json!
  return {
    res: {
      status: 202,
      body: 'HttpFnReturnContext body',
    },
  };
};
