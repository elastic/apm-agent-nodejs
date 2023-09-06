/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// early versions of redis@4 were released under
// the @node-redis namespace. This ensures our
// instrumentation works whether it's required with
// the `@node-redis/client` name or the
// `@redis/client` name
module.exports = require('../../../../@redis/client/dist/lib/client');
