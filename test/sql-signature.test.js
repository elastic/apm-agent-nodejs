/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test the Node.js APM agent's summarization of SQL statements used to set
// 'span.name' for DB spans against the cross-agent JSON spec.

const sqlSummary = require('sql-summary')
const tape = require('tape')

tape.test('cross-agent SQL statement summary/signature', function (t) {
  const sqlSigCases = require('./fixtures/json-specs/sql_signature_examples.json')
  sqlSigCases.forEach(sqlSigCase => {
    let desc = JSON.stringify(sqlSigCase.input)
    if (sqlSigCase.comment) {
      desc += ' # ' + sqlSigCase.comment
    }
    t.equal(sqlSummary(sqlSigCase.input), sqlSigCase.output, desc)
  })
  t.end()
})
