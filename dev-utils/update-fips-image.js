#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Update the wolfi image for testing with FIPS in the `test-fips.yml` workflow file.
// Assumes docker daemon is installed and running
//
// Usage:
//      node dev-utils/update-fips-image.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOP = path.resolve(__dirname, '..');
const file = path.resolve(TOP, '.github', 'workflows', 'test-fips.yml');

// ---- mainline

function main() {
  // We should replace any reference to the fips image in the yml
  // file. It's easy to detect since it has the form
  // ```
  // image: docker.elastic.co/wolfi/chainguard-base-fips:latest@sha256:SHA_VALUE
  // ```
  // So checking for a substring maybe is enough. We will replace that line for a
  // new one.
  const imageRef = 'docker.elastic.co/wolfi/chainguard-base-fips:latest';

  // Get the latest and extract the SHA
  const out = execSync(`docker image pull ${imageRef}`, { encoding: 'utf-8' });
  let sha256;
  for (const line of out.split('\n')) {
    if (line.startsWith('Digest: ')) {
      sha256 = line.slice(8);
    }
  }
  console.log('Latest FIPS image sha256 is', sha256);

  // Read the file content and replace any reference to the FIPS image
  const content = fs.readFileSync(file, { encoding: 'utf-8' }).split('\n');
  const search = `image: ${imageRef}@sha256:`;
  let shouldUpdate = false;

  for (let i = 0; i < content.length; i++) {
    const line = content[i];
    const isImageLine = line.indexOf(search) !== -1;
    const isShaOutdated = isImageLine && line.indexOf(sha256) === -1;

    if (isImageLine && isShaOutdated) {
      console.log('Found FIPS image with outdated sha256. Updating');
      shouldUpdate = true;
      content[i] = line.replace(/image:.+/, `image: ${imageRef}@${sha256}`);
    }
  }

  if (shouldUpdate) {
    fs.writeFileSync(file, content.join('\n'), { encoding: 'utf-8' });
  } else {
    console.log('No outdated FIPS images found.');
  }
}

if (require.main === module) {
  main();
}
