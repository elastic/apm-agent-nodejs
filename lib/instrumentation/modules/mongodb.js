/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Since we are also instrumenting submodules we moved this instrumentation
// to a dedicated folder
module.exports = require('./mongodb/lib/index');
