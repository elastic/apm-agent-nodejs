#!/usr/bin/env bash

set -exo pipefail

if [ $# -lt 1 ]; then
  echo "Nodejs version missing"
  exit 2
fi

NODE_VERSION=$1
if [[ ! -z $2  ]]; then
  TAV_VERSIONS=`echo "$2" | sed -e 's/\+/,/g'`
  CMD='npm run test:tav|tee tav-output.tap'
else
  CMD='nyc node test/test.js | tee test-suite-output.tap
  nyc report --reporter=lcov > coverage.lcov'
fi

NODE_VERSION=${1} docker-compose --no-ansi --log-level ERROR -f ./test/docker-compose.yml -f ./test/docker-compose.ci.yml run \
  -e NODE_VERSION=${NODE_VERSION} \
  -e TAV=${TAV_VERSIONS} \
  -e HOME=/app \
  -v "$(pwd)":/app \
  -w /app \
  -u $UID \
  --rm node_tests \
  /bin/bash \
  -c "set -xueo pipefail
      export PATH=${PATH}:/app/node_modules:/app/node_modules/.bin
      npm config list
      npm install
      node --version
      npm --version
      ${CMD}"

NODE_VERSION=${1} docker-compose --no-ansi --log-level ERROR -f ./test/docker-compose.yml -f ./test/docker-compose.ci.yml down -v
