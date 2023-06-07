/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

/* eslint-disable no-unused-vars, no-undef */

const bench = require('./utils/bench')

bench('transaction-reading-file', {
  setup () {
    const agent = this.benchmark.agent
    const fs = this.benchmark.fs
    const filename = this.benchmark.testFile
  },
  fn (deferred) {
    if (agent) agent.startTransaction()
    fs.readFile(filename, err => {
      if (err) throw err
      if (agent) agent.endTransaction()
      deferred.resolve()
    })
  }
})
