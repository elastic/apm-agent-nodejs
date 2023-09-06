#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { execSync } = require('child_process');
const semver = require('semver');

// Prints versions config for ".tav.yml" for the given package and version range
function main(packageName, versionRange) {
  // Validation
  if (!packageName || !versionRange) {
    console.error('package or version range not defined');
    return;
  }
  if (!semver.validRange(versionRange)) {
    console.error('version range %s is not valid', versionRange);
    return;
  }

  // Try to get versions
  const info = JSON.parse(
    execSync('npm info -j ' + packageName, { encoding: 'utf-8' }),
  );
  const versions = info.versions.filter((v) =>
    semver.satisfies(v, versionRange),
  );
  const modulus = Math.floor((versions.length - 2) / 5);
  const vers = versions.filter(
    (v, idx, arr) => idx % modulus === 0 || idx === arr.length - 1,
  );
  console.log(
    '  # Test v%s, every N=%d of %d releases, and current latest.',
    versions[0],
    modulus,
    versions.length,
  );
  console.log(
    "  versions: '%s || >%s' # subset of '%s'",
    vers.join(' || '),
    vers[vers.length - 1],
    versionRange,
  );
}

// Run
main(process.argv[2], process.argv[3]);
