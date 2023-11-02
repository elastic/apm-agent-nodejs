#!/usr/bin/env bash
set -exo pipefail

NODE_VERSION=${1:?Nodejs version missing NODE_VERSION is not set}

NODE_VERSION=${NODE_VERSION} \
USER_ID="$(id -u):$(id -g)" \
docker --log-level error\
  compose \
  --ansi never \
  -f .ci/docker/docker-compose-all.yml \
  up \
  --build \
  --remove-orphans \
  --quiet-pull \
  --detach
