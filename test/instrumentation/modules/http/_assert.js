/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = assert;

function assert(t, data) {
  t.strictEqual(data.transactions.length, 1, 'should have one transaction');
  t.strictEqual(data.spans.length, 0, 'should have zero spans');

  var trans = data.transactions[0];

  t.strictEqual(
    trans.name,
    'GET unknown route',
    'should have expected transaction name',
  );
  t.strictEqual(trans.type, 'request', 'should have expected transaction type');
  t.strictEqual(
    trans.result,
    'HTTP 2xx',
    'should have expected transaction result',
  );
  t.strictEqual(
    trans.context.request.method,
    'GET',
    'should have expected transaction context.request.method',
  );
}
