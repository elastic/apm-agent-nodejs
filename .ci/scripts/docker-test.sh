#!/usr/bin/env bash
set -xueo pipefail

node --version
npm --version
npm install

if [[ ! -z ${TAV}  ]]; then
  npm run test:tav > tav-output.tap
else
  nyc node test/test.js > test-suite-output.tap
  nyc report --reporter=lcov > coverage.lcov
fi
