/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

/**
 * Return whether the current 'fastify' version is incompatible with the
 * current version of node. If so, this returns a string that can be used
 * as a reason for a test skip message. Otherwise it returns false.
 *
 * Usage:
 *    const isFastifyIncompat = require('.../_is_fastify_incompat')()
 *    if (isFastifyIncompat) {
 *      console.log(`# SKIP ${isFastifyIncompat}`)
 *      process.exit()
 *    }
 *
 * Dev Note: These version ranges should mirror the fastify section of ".tav.yml".
 *
 * @returns {string | boolean}
 */
function isFastifyIncompat() {
  const nodeVer = process.version;
  const fastifyVer = require('fastify/package.json').version;
  const msg = `fastify@${fastifyVer} is incompatible with node@${nodeVer}`;

  if (
    semver.satisfies(fastifyVer, '1.x') &&
    !semver.satisfies(nodeVer, '>=6 <12')
  ) {
    return msg;
  }
  if (
    semver.satisfies(fastifyVer, '2.x') &&
    !semver.satisfies(nodeVer, '>=6 <15')
  ) {
    return msg;
  }
  if (
    semver.satisfies(fastifyVer, '3.x') &&
    !semver.satisfies(nodeVer, '>=10')
  ) {
    return msg;
  }
  if (
    semver.satisfies(fastifyVer, '4.x') &&
    !semver.satisfies(nodeVer, '>=14.6.0')
  ) {
    return msg;
  }

  return false;
}

module.exports = isFastifyIncompat;
