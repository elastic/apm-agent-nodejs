#!/usr/bin/env bash

set -e

if [ $# -lt 1 ]; then
  echo "Nodejs version missing"
  exit 2
fi

npm_cache="$HOME/.npm"
docker_npm_cache="/home/node/.npm"

NODE_VERSION=$1
if [[ ! -z $2  ]]; then
  TAV_VERSIONS=`echo "$2" | sed -e 's/\+/,/g'`
  CMD='npm i test-all-versions &&
       export PATH=./node_modules/.bin:$PATH &&
       tav --quiet'
else
  CMD='npm test'
fi

docker-compose build --pull --build-arg NODE_VERSION=$1 node_tests
docker-compose run \
  -e NODE_VERSION=${NODE_VERSION} -e TAV=${TAV_VERSIONS} -e CI=true \
  -v ${npm_cache}:${docker_npm_cache} \
  --rm node_tests \
  /bin/bash \
  -c "npm config set cache ${docker_npm_cache} --global
      npm install 
      if [[ ${NODE_VERSION} == '8' ]]; then npm install -g npm@4; fi;
			node --version  
			npm --version  
      ${CMD}"
