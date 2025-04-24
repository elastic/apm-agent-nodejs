/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'express' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isExpressIncompat = require('.../_is_express_incompat')()
 *    if (isExpressIncompat) {
 *      console.log(`# SKIP ${isExpressIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the express section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isExpressIncompat() {
  const nodeVer = process.version;
  const expressVer = require('express/package.json').version;
  const msg = `express@${expressVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(expressVer, '>=5') &&
    semver.satisfies(nodeVer, '<18.0.0')
  ) {
    return msg;
  }

  return false;
}

module.exports = isExpressIncompat;
