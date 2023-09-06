/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function () {
  // This uses a '$return' binding, so the retval is used.
  // Any HTTP response from an Azure Function is meant to be an *object*. If
  // not, then Azure returns a 500 response with an empty body.
  return 'this is return value string';
};
