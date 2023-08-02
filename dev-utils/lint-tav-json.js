#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Check that the ".ci/tav.json" file includes all the modules defined in
// the various ".tav.yml" files. If not, then CI "TAV" runs are not testing
// all modules.
//
// Also check that the product of "versions" and "modules" in tav.json does
// not exceed the 256 GH Actions limit.
// https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration#usage-limits

const fs = require('fs');
const path = require('path');

const glob = require('glob');
const yaml = require('js-yaml');

const TOP = path.resolve(path.join(__dirname, '..'));
const TAV_JSON_PATH = path.join('.ci', 'tav.json');

// ---- mainline

function main(argv) {
  let numErrors = 0;

  // Find all module names in ".tav.yml" files.
  const moduleNamesFromYaml = new Set();
  const tavYmlPaths = glob.sync('**/.tav.yml', {
    ignore: ['**/node_modules/**'],
  });
  // console.log('tavYmlPaths:', tavYmlPaths);
  tavYmlPaths.forEach((p) => {
    const tavCfg = yaml.load(fs.readFileSync(p, 'utf8'));
    Object.keys(tavCfg).forEach((k) => {
      const v = tavCfg[k];
      moduleNamesFromYaml.add(v.name || k);
    });
  });
  // console.log('moduleNamesFromYaml: ', moduleNamesFromYaml);

  // Find module names in ".ci/tav.json".
  const moduleNamesFromJson = new Set();
  const tavJson = JSON.parse(fs.readFileSync(path.join(TOP, TAV_JSON_PATH)));
  tavJson.modules.forEach((m) => {
    m.name.split(',').forEach((moduleName) => {
      moduleNamesFromJson.add(moduleName);
    });
  });
  const matrix = [];
  for (const mod of tavJson.modules) {
    mod.name.split(',').forEach((moduleName) => {
      moduleNamesFromJson.add(moduleName);
    });
    for (const nv of tavJson.versions) {
      if (mod.minVersion && nv >= mod.minVersion) {
        matrix.push(`${mod.name} ${nv}`);
      }
    }
  }
  // console.log('moduleNamesFromJson: ', moduleNamesFromJson);

  // Matrix 256 limit.
  if (matrix.length > 256) {
    console.error(
      'lint-tav-json: #versions * #modules from "%s" is >256, which exceeds the GH Actions workflow matrix limit: %d',
      TAV_JSON_PATH,
      matrix.length,
    );
    numErrors += 1;
  }

  // Error out if any discrepancies.
  const missingFromYaml = new Set(
    [...moduleNamesFromJson].filter((x) => !moduleNamesFromYaml.has(x)),
  );
  if (missingFromYaml.size > 0) {
    console.error(
      'lint-tav-json: the following %d module name(s) are in "%s" but not in the "**/.tav.yml" files: %s',
      missingFromYaml.size,
      TAV_JSON_PATH,
      missingFromYaml,
    );
    numErrors += 1;
  }
  const missingFromJson = new Set(
    [...moduleNamesFromYaml].filter((x) => !moduleNamesFromJson.has(x)),
  );
  if (missingFromJson.size > 0) {
    console.error(
      'lint-tav-json: the following %d module name(s) are in the "**/.tav.yml" files but not in "%s": %s',
      missingFromJson.size,
      TAV_JSON_PATH,
      missingFromJson,
    );
    numErrors += 1;
  }

  if (numErrors > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv);
}
