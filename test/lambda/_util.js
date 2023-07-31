/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

function assertError(t, received, expected) {
  t.strictEqual(received, expected);
}

function assertTransaction(t, trans, name) {
  t.strictEqual(trans.name, name);
  t.ok(trans.ended);
}

module.exports = {
  assertError,
  assertTransaction,
};
