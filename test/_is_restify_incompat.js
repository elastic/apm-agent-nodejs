/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'restify' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isRestifyIncompat = require('.../_is_restify_incompat')()
 *    if (isRestifyIncompat) {
 *      console.log(`# SKIP ${isRestifyIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the restify section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isRestifyIncompat() {
  const nodeVer = process.version;
  const restifyVer = require('restify/package.json').version;
  const msg = `restify@${restifyVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(restifyVer, '<10.0.0') &&
    semver.satisfies(nodeVer, '>=18.0.0', { includePrerelease: true })
  ) {
    return msg;
  }
  if (
    semver.satisfies(restifyVer, '>=9.0.0') &&
    semver.satisfies(nodeVer, '<14.18.0')
  ) {
    return msg;
  }

  return false;
}

module.exports = isRestifyIncompat;
