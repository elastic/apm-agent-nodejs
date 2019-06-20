#!/usr/bin/env bash
set -xueo pipefail

# This particular configuration is required to be installed in the baremetal
nvm install node
nvm ls-remote
nvm use node

npm config list
npm install

node --version
npm --version

npm run test:cibenchmark | tee tav-output.tap
