/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
});

var test = require('tape');

var ins = agent._instrumentation;

require('./_shared-promise-tests')(test, Promise, ins);
