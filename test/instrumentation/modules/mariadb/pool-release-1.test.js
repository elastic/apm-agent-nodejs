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
const mariadbVer = safeGetPackageVersion('mariadb');
if (semver.gte(mariadbVer, '3.0.0') && semver.lt(process.version, '14.0.0')) {
  console.log(
    `# SKIP mariadb@${mariadbVer} does not support node ${process.version}`,
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

var mariadb = require('mariadb/callback');
var test = require('tape');

var utils = require('./_utils');

test('release connection prior to transaction', function (t) {
  createPool(function (pool) {
    pool.getConnection(function (err, conn) {
      t.error(err);
      console.log('Test1');
      conn.release(); // important to release connection before starting the transaction
      console.log('Test2');

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
    cb(mariadb.createPool(utils.credentials()));
  });
}

function setup(cb) {
  utils.reset(cb);
}
