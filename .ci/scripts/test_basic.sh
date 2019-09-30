#!/usr/bin/env bash
set -xueo pipefail

npm config list
npm install

node --version
npm --version

npm run lint
npm run lint:commit
npm run test:deps
