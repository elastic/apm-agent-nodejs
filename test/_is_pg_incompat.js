/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'pg' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isPgIncompat = require('.../_is_pg_incompat')()
 *    if (isPgIncompat) {
 *      console.log(`# SKIP ${isPgIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the pg section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isPgIncompat() {
  const nodeVer = process.version;
  const pgVer = require('pg/package.json').version;
  const msg = `pg@${pgVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(pgVer, '>=8.16.0') &&
    semver.satisfies(nodeVer, '<16.0.0')
  ) {
    return msg;
  }

  return false;
}

module.exports = isPgIncompat;
