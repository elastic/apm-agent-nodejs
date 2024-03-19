/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const {
  getPathFromRequest,
} = require('../../lib/instrumentation/express-utils');

test('#getPathFromRequest', function (t) {
  t.test('should return path for an auth like url', function (t) {
    const req = createRequest('//foo/bar');
    const path = getPathFromRequest(req, false, true);
    t.equals(path, '//foo/bar');
    t.end();
  });

  t.test('should return path for an absolute url', function (t) {
    const req = createRequest('https://test.com/foo/bar?query=value#hash');
    const path = getPathFromRequest(req, false, true);
    t.equals(path, '/foo/bar');
    t.end();
  });

  t.test('should return path for an invalid host header', function (t) {
    const req = createRequest(
      'https://test.com/foo/bar?query=value#hash',
      // eslint-disable-next-line prettier/prettier, no-useless-escape
      'invalid\host\name',
    );
    const path = getPathFromRequest(req, false, true);
    t.equals(path, '/foo/bar');
    t.end();
  });
});

function createRequest(url, host = 'example.com') {
  return {
    url,
    headers: {
      host,
    },
  };
}
