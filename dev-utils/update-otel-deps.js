#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Update OTel deps in the various package-lock.json and .tav.yml files; and
// in the supported-technologies.asciidoc file.
//
// Usage:
//      node dev-utils/update-otel-deps.js

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const semver = require('semver');

const TOP = path.resolve(__dirname, '..');

// ---- support functions

function latestPkgVer(pkgName) {
  const latest = execSync(`npm info ${pkgName} dist-tags.latest`, {
    encoding: 'utf8',
  }).trimEnd();
  assert(latest);
  return latest;
}

async function updateOTelDeps() {
  const gitFiles = execSync('git ls-files', {
    cwd: TOP,
    encoding: 'utf8',
  }).split('\n');

  const packageJsonFiles = gitFiles.filter(
    (f) => path.basename(f) === 'package.json',
  );
  for (const pjFile of packageJsonFiles) {
    const pjAbspath = path.join(TOP, pjFile);
    const pj = JSON.parse(fs.readFileSync(pjAbspath));
    const otelDeps = [
      Object.keys(pj.dependencies || {}).filter((d) =>
        d.startsWith('@opentelemetry/'),
      ),
      Object.keys(pj.devDependencies || {}).filter((d) =>
        d.startsWith('@opentelemetry/'),
      ),
    ].flat();
    if (otelDeps.length === 0) {
      continue;
    }
    const cmd = `npm update ${otelDeps.join(' ')}`;
    console.log('%s: update %d OTel deps: `%s`', pjFile, otelDeps.length, cmd);
    execSync(cmd, { cwd: path.dirname(pjAbspath) });
  }

  const hasOTelApiBlock = /^"@opentelemetry\/api":/m;
  // The `d` RegExp flag requires at least Node.js 16.0.0.
  const otelApiBlock =
    /^"@opentelemetry\/api":\n\s+versions: '>=[\d.]+ <([\d.]+)'/dm;
  // If the current latest is '1.2.3', this will return '1.3.0'.
  const nextOTelApiMinor = semver.inc(
    latestPkgVer('@opentelemetry/api'),
    'minor',
  );
  const tavYmlFiles = gitFiles.filter((f) => path.basename(f) === '.tav.yml');
  for (const tyFile of tavYmlFiles) {
    let tyAbspath = path.resolve(TOP, tyFile);
    let content = fs.readFileSync(tyAbspath, { encoding: 'utf8' });
    if (!hasOTelApiBlock.test(content)) {
      continue;
    }
    const match = otelApiBlock.exec(content);
    if (!match) {
      throw new Error(
        `could not parse "@opentelemetry/api" block in "${tyFile}`,
      );
    }
    if (match[1] === nextOTelApiMinor) {
      continue;
    }
    console.log('%s: update @opentelemetry/api version range', tyFile);
    content =
      content.slice(0, match.indices[1][0]) +
      nextOTelApiMinor +
      content.slice(match.indices[1][1]);
    fs.writeFileSync(tyAbspath, content, { encoding: 'utf8' });
  }

  // | <<opentelemetry-bridge,@opentelemetry/api>> | >=1.0.0 <1.5.0
  const docFile = 'docs/supported-technologies.asciidoc';
  const docAbspath = path.resolve(TOP, docFile);
  const otelApiDocBlock = /@opentelemetry\/api>> \| >=[\d.]+ <([\d.]+)$/dm;
  let content = fs.readFileSync(docAbspath, { encoding: 'utf8' });
  const match = otelApiDocBlock.exec(content);
  if (!match) {
    throw new Error(`could not parse "@opentelemetry/api" block in ${docFile}`);
  }
  if (match[1] !== nextOTelApiMinor) {
    console.log('%s: update @opentelemetry/api version range', docFile);
    content =
      content.slice(0, match.indices[1][0]) +
      nextOTelApiMinor +
      content.slice(match.indices[1][1]);
    fs.writeFileSync(docAbspath, content, { encoding: 'utf8' });
  }
}

// ---- mainline

async function main() {
  await updateOTelDeps();
}

if (require.main === module) {
  main();
}
