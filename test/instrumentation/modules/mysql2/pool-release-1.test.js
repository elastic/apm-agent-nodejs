/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const semver = require('semver');
const { safeGetPackageVersion } = require('../../../_utils');
const mysql2Ver = safeGetPackageVersion('mysql2');
if (semver.gte(mysql2Ver, '3.0.0') && semver.lt(process.version, '14.6.0')) {
  console.log(
    `# SKIP mysql2@${mysql2Ver} does not support node ${process.version}`,
  );
  process.exit();
}

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

var mysql = require('mysql2');
var test = require('tape');

var utils = require('./_utils');

test('release connection prior to transaction', function (t) {
  createPool(function (pool) {
    pool.getConnection(function (err, conn) {
      t.error(err);
      conn.release(); // important to release connection before starting the transaction

      agent.startTransaction('foo');
      t.ok(agent.currentTransaction);

      pool.getConnection(function (err, conn) {
        t.error(err);
        t.ok(agent.currentTransaction);
        pool.end();
        t.end();
      });
    });
  });
});

function createPool(cb) {
  setup(function () {
    cb(mysql.createPool(utils.credentials()));
  });
}

function setup(cb) {
  utils.reset(cb);
}
