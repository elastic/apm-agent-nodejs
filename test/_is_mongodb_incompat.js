/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'mongodb' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isMongodbIncompat = require('.../_is_mongodb_incompat')()
 *    if (isMongodbIncompat) {
 *      console.log(`# SKIP ${isMongodbIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the mongodb section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isMongodbIncompat() {
  const nodeVer = process.version;
  const mongodbVer = require('mongodb/package.json').version;
  const msg = `mongodb@${mongodbVer} is incompatible with node@${nodeVer}`;

  if (semver.satisfies(mongodbVer, '4.x')) {
    if (!semver.satisfies(nodeVer, '>=12.9.0')) {
      return msg;
    }
  } else if (semver.satisfies(mongodbVer, '>=5.0.0')) {
    if (!semver.satisfies(nodeVer, '>=14.20.1')) {
      return msg;
    }
  }

  return false;
}

module.exports = isMongodbIncompat;
