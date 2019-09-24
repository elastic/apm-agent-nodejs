#!/usr/bin/env bash
set -xueo pipefail

major_node_version=`node --version | cut -d . -f1 | cut -d v -f2`
minor_node_version=`node --version | cut -d . -f2`

if [[ $major_node_version -eq 8 ]] && [[ $minor_node_version -lt 8 ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS}} --expose-http2"
fi

export
id
node --version
npm --version
npm install

if [[ -n ${TAV} ]]; then
  npm run test:tav|tee tav-output.tap
else
  nyc node test/test.js | tee test-suite-output.tap
  nyc report --reporter=lcov > coverage.lcov
fi
