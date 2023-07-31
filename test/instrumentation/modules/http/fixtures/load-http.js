/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const assert = require('assert');
const http = require('http');
assert(http.get, 'http.get is defined');
assert(http.request, 'http.request is defined');
