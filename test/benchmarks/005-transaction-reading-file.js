/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

/* eslint-disable no-unused-vars, no-undef */

const bench = require('./utils/bench');

bench('transaction-reading-file', {
  setup() {
    var agent = this.benchmark.agent;
    var fs = this.benchmark.fs;
    var filename = this.benchmark.testFile;
  },
  fn(deferred) {
    if (agent) agent.startTransaction();
    fs.readFile(filename, (err) => {
      if (err) throw err;
      if (agent) agent.endTransaction();
      deferred.resolve();
    });
  },
});
