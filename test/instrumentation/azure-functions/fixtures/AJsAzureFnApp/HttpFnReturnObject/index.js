/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function () {
  // Using a '$return' binding, so only the return value is used (not
  // `context.res` or `context.bindings.*`). Any object is fine, but if it
  // provides none of the fields for an HTTP response, then the default is used.
  return { foo: 'bar' };
};
