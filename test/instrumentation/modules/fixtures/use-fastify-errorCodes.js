/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --require=./start.js test/instrumentation/modules/fixtures/use-fastify-errorCodes.js

const assert = require('assert');
const fastify = require('fastify');

// The `errorCodes` export was added in fastify@4.8.0. For a while the
// instrumentation would break the export.
assert(fastify.errorCodes.FST_ERR_NOT_FOUND, 'fastify.errorCodes exists');

// This assert ensures that this require-style works as well:
//    const { fastify } = require('fastify')
assert(fastify === fastify.fastify, 'fastify.fastify is correct');
