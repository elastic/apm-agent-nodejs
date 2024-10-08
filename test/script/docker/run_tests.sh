#!/usr/bin/env bash

set -exo pipefail

if [ $# -lt 1 ]; then
  echo "Nodejs version missing"
  exit 2
fi

npm_cache="$HOME/.npm"
docker_npm_cache="/home/node/.npm"

NODE_VERSION=$1
if [[ ! -z $2  ]]; then
  TAV_MODULES=`echo "$2" | sed -e 's/\+/,/g'`
  CMD='npm run test:tav'
else
  CMD='npm test'
fi

NODE_VERSION=${1} docker compose --no-ansi --log-level ERROR -f ./test/docker-compose.yml -f ./test/docker-compose.ci.yml run \
  -e NODE_VERSION=${NODE_VERSION} \
  -e TAV=${TAV_MODULES} \
  -e CI=true \
  -v ${npm_cache}:${docker_npm_cache} \
  -v "$(pwd)":/app \
  -w /app \
  --rm node_tests \
  /bin/bash \
  -c "npm config set cache ${docker_npm_cache} --global
      npm ci
      node --version
      npm --version
      ${CMD}"

NODE_VERSION=${1} docker compose --no-ansi --log-level ERROR -f ./test/docker-compose.yml -f ./test/docker-compose.ci.yml down -v
