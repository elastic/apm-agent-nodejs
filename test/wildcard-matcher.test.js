/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
var test = require('tape');

const { WildcardMatcher } = require('../lib/wildcard-matcher');

test('tests cross agent transaction_ignore_urls globs', function (t) {
  const matcher = new WildcardMatcher();
  const fixtures = require('./fixtures/json-specs/wildcard_matcher_tests.json');
  for (const [name, fixture] of Object.entries(fixtures)) {
    for (const [pattern, cases] of Object.entries(fixture)) {
      for (const [string, expected] of Object.entries(cases)) {
        const result = matcher.match(string, pattern);
        t.equals(
          result,
          expected,
          `Fixture ${name}, testing ${pattern} vs. ${string}`,
        );
      }
    }
  }
  t.end();
});
