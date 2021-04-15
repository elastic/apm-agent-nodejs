#!/usr/bin/env bash
set -exo pipefail

NODE_VERSION=${1:?Nodejs version missing NODE_VERSION is not set}

NODE_VERSION=${NODE_VERSION} docker-compose \
  --ansi never \
  -f .ci/docker/docker-compose-all.yml \
  logs \
  --timestamps > docker-compose-logs.txt

NODE_VERSION=${NODE_VERSION} docker-compose \
  --ansi never \
  --log-level ERROR \
  -f .ci/docker/docker-compose-all.yml \
  down -v
