/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

// 'hapi' and '@hapi/hapi' versions have some challenges with compat with
// various versions of node. This method tells you if the current versions
// are incompatible.
function isHapiIncompat(moduleName) {
  var hapiVersion = require(`${moduleName}/package.json`).version;

  // hapi 17+ requires Node.js 8.9.0 or higher
  if (
    semver.lt(process.version, '8.9.0') &&
    semver.gte(hapiVersion, '17.0.0')
  ) {
    return true;
  }
  // hapi 19+ requires Node.js 12 or higher
  if (
    semver.lt(process.version, '12.0.0') &&
    semver.gte(hapiVersion, '19.0.0')
  ) {
    return true;
  }
  // - hapi 18.1.0 (the last hapi 18.x) was released before node v12 was released,
  //   and tests with hapi@18 and node >=16 is known to hang.
  // - @hapi/hapi@20.1.2 fixed an issue (https://github.com/hapijs/hapi/pull/4225)
  //   needed to work with node >=16. Earlier versions of Hapi will crash when
  //   handling a POST.
  if (
    semver.gte(process.version, '16.0.0') &&
    semver.lt(hapiVersion, '20.1.2')
  ) {
    return true;
  }
  // hapi 21+ requires Node.js 14.10.0 or higher.
  if (
    semver.lt(process.version, '14.10.0') &&
    semver.gte(hapiVersion, '21.0.0')
  ) {
    return true;
  }

  // hapi does not work on early versions of Node.js 10 because of
  // https://github.com/nodejs/node/issues/20516
  //
  // NOTE: Do not use semver.satisfies, as it does not match prereleases
  var parsed = semver.parse(process.version);
  if (parsed.major === 10 && parsed.minor >= 0 && parsed.minor < 8) {
    return true;
  }

  return false;
}

module.exports = isHapiIncompat;
