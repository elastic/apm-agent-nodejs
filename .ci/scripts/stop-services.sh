#!/usr/bin/env bash
set -exo pipefail

docker-compose \
  --no-ansi \
  --log-level ERROR \
  --file .ci/docker/docker-compose-wait.yml \
  logs \
  --timestamps \
  --tail=100

docker-compose \
  --no-ansi \
  --log-level ERROR \
  --file .ci/docker/docker-compose-wait.yml \
  down \
  --volumes \
  --remove-orphans
