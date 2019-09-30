#!/usr/bin/env bash
set -xueo pipefail

npm config list
npm install

node --version
npm --version

npm run test:types
npm run test:babel
npm run test:esm
