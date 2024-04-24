/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { satisfies } = require('semver');

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

  if (satisfies(undiciVer, '>=6.13.0') && satisfies(nodeVer, '<18.17.0')) {
    // See discussion at https://github.com/nodejs/undici/issues/3123
    return msg;
  } else if (satisfies(undiciVer, '>=6.0.0') && satisfies(nodeVer, '<18.0.0')) {
    return msg;
  } else if (
    satisfies(undiciVer, '>=5.28.0') &&
    satisfies(nodeVer, '<14.18.0')
  ) {
    return msg;
  }

  return false;
}

module.exports = isUndiciIncompat;
