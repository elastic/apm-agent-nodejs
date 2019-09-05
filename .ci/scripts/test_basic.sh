#!/usr/bin/env bash
set -xueo pipefail

npm config list
npm install

node --version
npm --version

npm run lint
npm run test:deps
