/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { appendFile, readFileSync } = require('fs');
const os = require('os');
const { resolve } = require('path');

const logResult = require('./result-logger');

const input = process.argv.slice(2);
const outputFile = input.length > 2 ? resolve(input.pop()) : null;
const [bench, control] = input
  .map((file) => readFileSync(file))
  .map((buf) => JSON.parse(buf));

calculateDelta(bench, control);
logResult(bench, control);

if (outputFile) storeResult();

function storeResult() {
  bench.controlStats = control.stats;

  const result = {
    '@timestamp': bench.times.timeStamp,
    ci: {
      build_cause: process.env.GIT_BUILD_CAUSE,
    },
    git: {
      branch: process.env.BRANCH_NAME,
      commit: process.env.GIT_BASE_COMMIT || process.env.GIT_COMMIT,
    },
    pr: {
      id: Number(process.env.CHANGE_ID) || null,
      title: process.env.CHANGE_TITLE,
      target: process.env.CHANGE_TARGET,
      url: process.env.CHANGE_URL,
    },
    os: {
      arch: os.arch(),
      cpus: os.cpus(),
      freemem: os.freemem(),
      homedir: os.homedir(),
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      platform: os.platform(),
      release: os.release(),
      totalmem: os.totalmem(),
      type: os.type(),
      uptime: os.uptime(),
    },
    process: {
      arch: process.arch,
      config: process.config,
      env: process.env,
      platform: process.platform,
      release: process.release,
      version: process.version,
      versions: process.versions,
    },
    bench,
  };

  const data = `{"index":{"_index":"benchmark-nodejs"}}\n${JSON.stringify(
    result,
  )}\n`;

  appendFile(outputFile, data, function (err) {
    if (err) throw err;
  });
}

function calculateDelta(bench, control) {
  // moe: The margin of error
  // rme: The relative margin of error (expressed as a percentage of the mean)
  // sem: The standard error of the mean
  // deviation: The sample standard deviation
  // mean: The sample arithmetic mean (secs)
  // variance: The sample variance
  bench.overhead = bench.stats.mean - control.stats.mean;
}
