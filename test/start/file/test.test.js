/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that agent start will pick up config from an "elastic-apm-node.js" file
// in the cwd.

process.chdir(__dirname);

var agent = require('../../..').start({
  disableSend: true,
});

const tape = require('tape');

tape('from-file configuration test', function (t) {
  t.equals(
    agent._conf.serviceName,
    'from-file',
    'serviceName comes from config file',
  );
  t.equals(
    agent._conf.active,
    false,
    'false values from config file override defaults',
  );
  t.equals(agent._conf.captureBody, 'off', 'existing defaults are preserved');
  t.end();
});
