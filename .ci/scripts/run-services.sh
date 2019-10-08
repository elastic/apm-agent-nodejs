#!/usr/bin/env bash
set -exo pipefail

USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  --file .ci/docker/docker-compose.yml \
  up \
  --build \
  --remove-orphans \
  --detach
