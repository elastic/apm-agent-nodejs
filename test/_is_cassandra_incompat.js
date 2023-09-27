/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');
const { safeGetPackageVersion } = require('./_utils');

/**
 * Return whether the current 'cassandra-driver' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isCassandraIncompat = require('.../_is_cassandra_incompat')()
 *    if (isCassandraIncompat) {
 *      console.log(`# SKIP ${isCassandraIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the cassandra section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isCassandraIncompat() {
  const nodeVer = process.version;
  const cassandraVer = safeGetPackageVersion('cassandra-driver');
  const msg = `cassandra@${cassandraVer} is incompatible with node@${nodeVer}`;

  // In version 4.7.0 there was a change introduced that is only supported
  // by nodejs v16.9.0 and above although the package.json defined
  // support range to >=8
  // https://datastax-oss.atlassian.net/browse/NODEJS-665
  if (
    semver.satisfies(cassandraVer, '4.7.0') &&
    !semver.satisfies(nodeVer, '>=16.9')
  ) {
    return msg;
  }
  // Since 4.7.1 the driver requires node >=16
  if (
    semver.satisfies(cassandraVer, '>=4.7.1') &&
    !semver.satisfies(nodeVer, '>=16')
  ) {
    return msg;
  }
  // The default support until 4.7.0 release
  if (
    semver.satisfies(cassandraVer, '>=3.0.0 <4.7.0') &&
    !semver.satisfies(nodeVer, '>=8')
  ) {
    return msg;
  }

  return false;
}

module.exports = isCassandraIncompat;
