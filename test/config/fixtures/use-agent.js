/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { NoopApmClient } = require('../../../lib/apm-client/noop-apm-client');

const APM_START_OPTIONS = {
  transport: () => new NoopApmClient(),
};

const apm = require('../../..').start(APM_START_OPTIONS);

// Report options used to start
console.log('use-agent log:' + JSON.stringify(APM_START_OPTIONS));

// Just spit out the resolved configuration
console.log('use-agent log:' + JSON.stringify(apm._conf));
