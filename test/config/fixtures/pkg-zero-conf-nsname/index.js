/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const apm = require('../../../..').start({
  disableSend: true,
  logLevel: 'off',
});
console.log(JSON.stringify(apm._conf));
