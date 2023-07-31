/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function () {
  // Using a '$return' binding, one can return the response data directly.
  return {
    status: 202,
    body: 'HttpFnReturnResponseData body',
  };
};
