/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A Lambda handler module that has a module name conflict with another
// module that the APM agent instruments: "express".

'use strict';
module.exports.foo = function origHandlerFuncName(event, context) {
  return 'fake handler';
};
