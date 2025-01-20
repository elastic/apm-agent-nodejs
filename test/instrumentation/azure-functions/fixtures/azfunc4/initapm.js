/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// For the normal use case an "initapm.js" would look like:
//    module.exports = require('elastic-apm-node').start(/* { ... } */)

module.exports = require('../../../../../').start();
