/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const stringify = require('fast-safe-stringify');

exports.serialize = function serialize(obj) {
  const str = tryJSONStringify(obj) || stringify(obj);
  return str + '\n';
};

function tryJSONStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {}
}
