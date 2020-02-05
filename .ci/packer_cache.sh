#!/usr/bin/env bash

source /usr/local/bin/bash_standard_lib.sh

docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f .ci/docker/docker-compose-all.yml \
  pull --quiet --ignore-pull-failures
