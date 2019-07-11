#!/usr/bin/env bash
set -xueo pipefail

export PATH=${PATH}:/$(pwd)/node_modules:/$(pwd)/node_modules/.bin
export HOME=$(pwd)

npm config list
npm install

node --version
npm --version

standard
npm run test:deps
npm run test:types
npm run test:babel

# TODO see if this test it is needed
major_node_version=$(node --version | cut -d . -f1 | cut -c2)
minor_node_version=$(node --version | cut -d . -f2)
if [[ $major_node_version -ge 8 ]] && [[ $minor_node_version -ge 5 ]] ; then
  npm run test:esm
fi
