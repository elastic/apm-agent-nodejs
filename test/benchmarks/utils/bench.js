/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const withAgent = !!process.env.AGENT;

module.exports = function (name, { agentConf, ...benchConf }) {
  let agent;

  if (withAgent) {
    agent = require('../../..').start(
      Object.assign(
        {
          serviceName: 'test',
          centralConfig: false,
          captureExceptions: false,
          metricsInterval: 0,
          logLevel: 'off',
        },
        agentConf,
      ),
    );
  }

  const Benchmark = require('benchmark');

  new Benchmark(
    Object.assign(
      {
        name: `${name} (${withAgent ? 'With Agent' : 'Without Agent'})`,
        initCount: 10000,
        maxTime: 60,
        defer: true,
        onStart() {
          // Prepare properties that need to be accessible inside the benchmark
          // test code. These can be accessed via `this.benchmark.*` from within
          // either the `setup` function or the `fn` function (as the regular
          // Node.js globals like `require` and `__filename` are not available to
          // those functions).
          this.fs = require('fs');
          this.callstack = require('./callstack');
          this.testFile = __filename;
          this.agent = agent;
        },
        onComplete(result) {
          process.stdout.write(
            JSON.stringify({
              name,
              count: result.target.count,
              cycles: result.target.cycles,
              hz: result.target.hz,
              stats: result.target.stats,
              times: result.target.times,
            }),
          );
          process.exit();
        },
      },
      benchConf,
    ),
  ).run();
};
