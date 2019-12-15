#!/usr/bin/env bash
set -exo pipefail

NODE_VERSION=${1:?Nodejs version missing NODE_VERSION is not set}

NODE_VERSION=${NODE_VERSION} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f .ci/docker/docker-compose-all.yml \
  up \
  --build \
  --remove-orphans \
  --abort-on-container-exit
