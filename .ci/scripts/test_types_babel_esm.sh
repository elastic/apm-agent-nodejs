#!/usr/bin/env bash
set -xueo pipefail

npm config list
npm install

node --version
npm --version

major_node_version=`node --version | cut -d . -f1 | cut -d v -f2`
minor_node_version=`node --version | cut -d . -f2`

npm run test:types

if [[ $major_node_version -ne 13 ]] || [[ $minor_node_version -gt 1 ]]; then
  npm run test:babel
fi

npm run test:esm
