/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'undici' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isUndiciIncompat = require('.../_is_undici_incompat')()
 *    if (isUndiciIncompat) {
 *      console.log(`# SKIP ${isUndiciIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the undici section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isUndiciIncompat() {
  const nodeVer = process.version;
  const undiciVer = require('undici/package.json').version;
  const msg = `undici@${undiciVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(undiciVer, '>=5.22.0') &&
    semver.satisfies(nodeVer, '<14.0.0')
  ) {
    return msg;
  }
  if (semver.satisfies(nodeVer, '<12.18.0')) {
    return msg;
  }

  return false;
}

module.exports = isUndiciIncompat;
