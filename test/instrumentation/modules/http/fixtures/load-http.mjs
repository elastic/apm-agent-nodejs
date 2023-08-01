/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

import assert from 'node:assert';
import http from 'node:http';
assert(http.get, 'http.get is defined');
assert(http.request, 'http.request is defined');
