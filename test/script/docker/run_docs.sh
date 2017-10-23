#!/usr/bin/env bash
set -e

docker build --pull -t node_docs --build-arg NODE_VERSION='latest' .
docker run \
  -e CI=true \
  --rm node_docs \
  /bin/bash \
  -c './script/build_docs.sh apm-agent-nodejs ./docs ./build'
