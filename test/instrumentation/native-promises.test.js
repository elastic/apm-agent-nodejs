/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

const test = require('tape')

const ins = agent._instrumentation

require('./_shared-promise-tests')(test, Promise, ins)
