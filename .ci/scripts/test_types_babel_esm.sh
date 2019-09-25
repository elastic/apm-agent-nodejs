#!/usr/bin/env bash
set -xueo pipefail

npm config list
npm install

node --version
npm --version

npm run test:types
npm run test:babel

major_node_version=$(node --version | cut -d . -f1 | cut -d v -f2)
minor_node_version=$(node --version | cut -d . -f2)
if [[ $major_node_version -eq 8 && $minor_node_version -ge 5 ]] || [[ $major_node_version -gt 8 ]]; then
  npm run test:esm
fi
