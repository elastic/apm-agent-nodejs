/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'koa' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isKoaIncompat = require('.../_is_koa_incompat')()
 *    if (isKoaIncompat) {
 *      console.log(`# SKIP ${isKoaIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the koa section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isKoaIncompat() {
  const nodeVer = process.version;
  const koaVer = require('koa/package.json').version;
  const msg = `koa@${koaVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(koaVer, '>=3.0.1') &&
    semver.satisfies(nodeVer, '<14.17')
  ) {
    return msg;
  }

  return false;
}

module.exports = isKoaIncompat;
