#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/** @typedef {import('semver').SemVer} SemVer */
/**
 * @typedef {Object} TavConfig
 * @property {String} [name]
 * @property {String} versions
 * @property {String} node
 * @property {String[]} commands
 * @property {Object} update-versions
 * @property {String} update-versions.mode
 * @property {String} update-versions.range
 */

'use strict';

// This script scans the `tav.yml` file placed at the root folder and for each
// entry checks if the `update-versions` property is defined. In that case
// the script will update the versions property according to the `update-versions`
// configuration:
// - range: only versions satisfiying this range will be in the update
// - mode: how we want to pick the versions within the range. These are
//   - latest-minors: picks 1st version of the range and all the latest minor versions
//   - latest-majors: picks 1st version of the range and all the latest major versions
//   - max-(n): picks 1st version, the last version and (n) versions in between them
//
// Usage:
//      node dev-utils/update-tav-versions.js

const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const semver = require('semver');
const yaml = require('js-yaml');

const TOP = path.resolve(path.join(__dirname, '..'));
const TAV_PATH = path.join(TOP, '.tav.yml');
const UPDATE_PROP = 'update-versions';

async function main() {
  /** @type {Map<string, string[]>} */
  const pkgVersMap = new Map(); // versions per package name
  /** @type {Map<string, string[]>} */
  const tavVersMap = new Map(); // versions per TAV configuration

  const tavContent = readFileSync(TAV_PATH, { encoding: 'utf-8' });
  /** @type {Record<string, TavConfig>} */
  const tavConfig = yaml.load(tavContent);
  const tavEntries = Object.entries(tavConfig);

  for (const entry of tavEntries) {
    const [name, cfg] = entry;

    if (!cfg[UPDATE_PROP]) continue;

    const { range, mode } = cfg[UPDATE_PROP];
    const pkgName = cfg.name || name;
    let pkgVersions = pkgVersMap.get(pkgName);

    if (!pkgVersions) {
      pkgVersions = JSON.parse(
        execSync(`npm view ${pkgName} versions -j`, { encoding: 'utf-8' }),
      );
      pkgVersMap.set(pkgName, pkgVersions);
    }

    let versions;
    const versInRange = pkgVersions
      .filter((v) => semver.satisfies(v, range))
      .map(semver.parse);

    if (mode === 'latest-minors') {
      versions = getLatestMinors(versInRange);
    } else if (mode === 'latest-majors') {
      versions = getLatestMajors(versInRange);
    } else if (mode.startsWith('max-')) {
      const num = Number(mode.split('-')[1]);
      if (isNaN(num)) {
        console.error(
          `Error: Version selection max-n mode for TAV config ${name} invalid (${mode})`,
        );
        continue;
      } else {
        versions = getMax(versInRange, Number(num));
      }
    } else {
      console.error(
        `Error: Version selection mode for TAV config ${name} unknown (${mode})`,
      );
      continue;
    }

    // Assuming range is always in the form ">={Lower_limit} <{Higher_Limit}"
    // - append lower version if not present
    // - append a range to test from latest version returned and up
    const firstVers = versions[0];
    const lastVers = versions[versions.length - 1];
    const [low] = range.split(' ').map(semver.coerce);

    if (semver.neq(firstVers, low)) {
      versions.unshift(low);
    }

    versions = versions.map((v) => v.toString());
    versions[versions.length - 1] = `^${lastVers.toString()}`;
    tavVersMap.set(name, versions);
  }

  // Now modify the file contents using the string so we do not loose comments
  const tavLines = tavContent.split('\n');
  let tavToUpdate;

  tavLines.forEach((line, idx) => {
    const isCfgStart = !/^[\s#]/.test(line) && line.endsWith(':');
    const tavName = isCfgStart ? line.replace(/[':]/g, '') : undefined;

    if (tavName) {
      tavToUpdate = tavVersMap.has(tavName) ? tavName : undefined;
    } else if (tavToUpdate && line.startsWith('  versions:')) {
      console.log(`Updating versions of ${tavToUpdate}`);
      const tavVers = tavVersMap.get(tavToUpdate);
      tavLines[idx] = `  versions: '${tavVers.join(' || ')}'`;
    }
  });

  writeFileSync(TAV_PATH, tavLines.join('\n'), { encoding: 'utf-8' });
}

// support functions

/**
 * From a given ordered list of versions returns the first, num in between and last. Example
 * - input: ['5.0.0', '5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.0', '5.8.1', '5.9.0']
 * - input: num = 4
 * - output: ['5.0.0', '5.1.0', '5.3.0', '5.5.0', '5.7.0', '5.8.1', '5.9.0']
 *             first   ^^^^^^^^^ 4 version in between ^^^^^^^^^^^^    last
 *
 * @param {SemVer[]} versions the version list where to extract
 * @param {Number} num the number of versions that should be in between
 * @returns {SemVer[]}
 */
function getMax(versions, num) {
  const modulus = Math.floor((versions.length - 2) / num);

  return versions.filter(
    (v, idx, arr) => idx % modulus === 0 || idx === arr.length - 1,
  );
}

/**
 * From a given ordered list of versions returns the latest minors. Example
 * - input: ['5.0.0', '5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.0', '5.8.1', '5.9.0']
 * - output: ['5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.1', '5.9.0']
 *
 * @param {SemVer[]} versions the version list where to extract latest minoes
 * @returns {SemVer[]}
 */
function getLatestMajors(versions) {
  // assuming sorted array
  const result = [];

  for (const ver of versions) {
    const lastVer = result[result.length - 1];

    if (!lastVer) {
      result.push(ver);
      continue;
    }

    if (lastVer.major === ver.major) {
      result.pop();
    }
    result.push(ver);
  }

  return result;
}

/**
 * From a given ordered list of versions returns the latest minors. Example
 * - input: ['5.0.0', '5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.0', '5.8.1', '5.9.0']
 * - output: ['5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.1', '5.9.0']
 *
 * @param {SemVer[]} versions the version list where to extract latest minoes
 * @returns {SemVer[]}
 */
function getLatestMinors(versions) {
  // assuming sorted array
  const result = [];

  for (const ver of versions) {
    const lastVer = result[result.length - 1];

    if (!lastVer) {
      result.push(ver);
      continue;
    }

    if (lastVer.major !== ver.major || lastVer.minor !== ver.minor) {
      result.push(ver);
    } else if (lastVer.compare(ver) < 0) {
      result[result.length - 1] = ver;
    }
  }

  return result;
}

// run
main();
