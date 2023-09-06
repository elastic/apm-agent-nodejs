/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

/* eslint-disable no-unused-vars, no-undef */

const bench = require('./utils/bench');

bench('transaction', {
  setup() {
    var agent = this.benchmark.agent;
  },
  fn(deferred) {
    if (agent) agent.startTransaction();
    setImmediate(() => {
      if (agent) agent.endTransaction();
      setImmediate(() => {
        deferred.resolve();
      });
    });
  },
});
