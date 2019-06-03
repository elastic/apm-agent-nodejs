#!/usr/bin/env bash
set -xueo pipefail
export
id
node --version
npm --version
npm config list
npm install

if [[ ! -z ${TAV}  ]]; then
  npm run test:tav|tee tav-output.tap
else
  nyc node test/test.js | tee test-suite-output.tap
  nyc report --reporter=lcov > coverage.lcov
fi
