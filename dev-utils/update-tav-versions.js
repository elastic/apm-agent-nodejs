#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Update version property for each module defined in .tav.yml file
// Usage:
//      node dev-utils/update-tav-versions.js

const { exec } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const semver = require('semver');
const yaml = require('js-yaml');

const TOP = path.resolve(path.join(__dirname, '..'));
const TAV_PATH = path.join(TOP, '.tav.yml');

async function main() {
  const tavContent = readFileSync(TAV_PATH, { encoding: 'utf-8' });
  const tavConfig = yaml.load(tavContent);
  const tavEntries = Object.entries(tavConfig);
  const modNames = new Set();
  const versionsMap = new Map();

  const versionModes = {
    'latest-minors': getLatestMinors,
  };

  // Fill the module/version map
  tavEntries.forEach(([name, cfg]) => modNames.add(cfg.name || name));

  // Get versions from all modules
  await Promise.all(
    Array.from(modNames).map((name) => {
      return getModuleVersions(name).then((versions) =>
        versionsMap.set(name, versions),
      );
    }),
  );

  // Now time to calculate the versions
  const tavLines = tavContent.split('\n');
  tavEntries.forEach(([name, cfg]) => {
    // Array.filter was bogus
    if (!cfg['versions-selection']) return;

    const { mode, range } = cfg['versions-selection'];
    const modName = cfg.name || name;
    const allVers = versionsMap.get(modName);
    const validVers = allVers.filter((v) => semver.satisfies(v, range));
    const newVers = versionModes[mode](validVers);

    // TODO: maybe it depends on the mode
    cfg.versions = newVers.join(' || ');

    // Fill the yamlText wihtout loosing comments and format
    let verIdx, modIdx;

    for (let i = 0; i < tavLines.length; i++) {
      const l = tavLines[i];
      if (!modIdx) {
        modIdx = l.startsWith(`${name}:`) ? i : undefined;
      } else {
        if (l.startsWith('  versions:')) {
          verIdx = i;
          break;
        }
      }
    }

    tavLines[verIdx] = `  versions: '${cfg.versions}'`;
  });

  writeFileSync(TAV_PATH, tavLines.join('\n'), { encoding: 'utf-8' });
}

// support functions

/**
 * From a given ordered list of versions returns the latest minors. Example
 * - input: ['5.0.0', '5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.0', '5.8.1', '5.9.0']
 * - output: ['5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.1', '5.9.0']
 *
 * @param {String[]} versions the version list where to extract latest minoes
 * @returns {String[]}
 */
function getLatestMinors(versions) {
  // assuming sorted array
  const result = [];

  for (const ver of versions.map(semver.parse)) {
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

  return result.map((v) => v.toString());
}

function getModuleVersions(name) {
  return new Promise((resolve, reject) => {
    const cmd = `npm view ${name} versions -j`;

    exec(cmd, { encoding: 'utf-8' }, function (err, stdout) {
      if (err) {
        return reject(err);
      }
      resolve(JSON.parse(stdout));
    });
  });
}

// Show time!
main();
