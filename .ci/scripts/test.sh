#!/usr/bin/env bash

#
# Run a set of Node.js APM agent tests with a particular version of node.js in
# Docker.
#
# - A suitable config file for "docker-compose build" is selected.
# - A "node_tests" container image, plus any images for services (like redis,
#   or postgresql) needed for this set of tests, are built.
# - The "node_tests" container is run, which runs the tests -- its command is:
#     /bin/bash -c ".ci/scripts/docker-test.sh"
#
# Usage:
#     .ci/scripts/tests.sh NODE_VERSION [TAV_MODULE] [IS_EDGE]
#
# - NODE_VERSION is a version of Node.js, e.g. "14", usable both to select
#   a image from Docker Hub:
#       docker pull docker.io/library/node:$NODE_VERSION
#   and to install Node with nvm:
#       nvm install $NODE_VERSION
# - TAV_MODULE, if specified and not the empty string, will result in
#   "test-all-versions" (TAV) tests being run. It identifies the name of a
#   module in ".tav.yml", e.g. "redis" or "pg". If this argument is not given
#   then the regular agent tests (i.e. the same as 'npm test') will be run.
# - IS_EDGE is "true" or "false" (the default). If true, then the node version
#   used for testing will be installed via:
#       NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} nvm install ${NODE_VERSION}
#   where typically the mirror URL is also set to one of:
#       https://nodejs.org/download/nightly/
#       https://nodejs.org/download/rc/
#   to test against a recent pre-releases of node.
#
# Examples:
#     .ci/scripts/test.sh 14                # regular tests against latest docker:14 image
#     .ci/scripts/test.sh 14 "" false       # same
#     .ci/scripts/test.sh 8.6               # regular tests against latest docker:8.6 image
#     .ci/scripts/test.sh 14 "redis" false  # redis TAV tests against latest docker:14 image
#     NVM_NODEJS_ORG_MIRROR=https://nodejs.org/download/nightly/ \
#       .ci/scripts/test.sh 14 "" true      # regular tests against latest node 14 nightly release
#

set -exo pipefail

function fatal {
  echo "$(basename $0): error: $*"
  exit 1
}

DOCKER_FOLDER=.ci/docker
NODE_VERSION=${1:?Nodejs version missing NODE_VERSION is not set}
TAV_MODULE=${2}
IS_EDGE=${3:false}

# Select a config for 'docker-compose build' that sets up (a) the "node_tests"
# container where the tests are actually run and (b) any services that are
# needed for this set of tests, if any.
if [[ "${IS_EDGE}" = "true" ]]; then
  # This will run the regular tests against rc and nightly builds of
  # node.js. It does NOT support TAV tests.
  if [[ -n "${TAV_MODULE}" ]]; then
    fatal "running TAV tests (TAV_MODULE=${TAV_MODULE}) with IS_EDGE=${IS_EDGE} is not supported"
  fi
  DOCKER_COMPOSE_FILE=docker-compose-edge.yml
elif [[ -n "${TAV_MODULE}" ]]; then
  # Run the TAV tests for a particular module.
  case ${TAV_MODULE} in
    redis|ioredis)
      DOCKER_COMPOSE_FILE=docker-compose-redis.yml
      ;;
    tedious)
      DOCKER_COMPOSE_FILE=docker-compose-mssql.yml
      ;;
    mongodb-core)
      DOCKER_COMPOSE_FILE=docker-compose-mongodb.yml
      ;;
    pg|knex)
      DOCKER_COMPOSE_FILE=docker-compose-postgres.yml
      ;;
    cassandra-driver)
      DOCKER_COMPOSE_FILE=docker-compose-cassandra.yml
      ;;
    elasticsearch|@elastic/elasticsearch)
      DOCKER_COMPOSE_FILE=docker-compose-elasticsearch.yml
      ;;
    mysql|mysql2)
      DOCKER_COMPOSE_FILE=docker-compose-mysql.yml
      ;;
    memcached)
      DOCKER_COMPOSE_FILE=docker-compose-memcached.yml
      ;;
    *)
      # Just the "node_tests" container. No additional services needed for testing.
      DOCKER_COMPOSE_FILE=docker-compose-node-test.yml
      ;;
  esac
else
  # Run the regular tests against a release build of node.js.
  DOCKER_COMPOSE_FILE=docker-compose-all.yml
fi

set +e
NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} \
ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS} \
NODE_VERSION=${NODE_VERSION} \
TAV_MODULE=${TAV_MODULE} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f ${DOCKER_FOLDER}/${DOCKER_COMPOSE_FILE} \
  build >docker-compose.log 2>docker-compose.err

if [ $? -gt 0 ] ; then
  echo "Docker compose failed, see the below log output"
  cat docker-compose.log && rm docker-compose.log
  cat docker-compose.err && rm docker-compose.err
  exit 1
fi

set -e
NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} \
ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS} \
NODE_VERSION=${NODE_VERSION} \
TAV_MODULE=${TAV_MODULE} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f ${DOCKER_FOLDER}/${DOCKER_COMPOSE_FILE} \
  up \
  --exit-code-from node_tests \
  --remove-orphans \
  --abort-on-container-exit \
  node_tests

NODE_VERSION=${NODE_VERSION} docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f ${DOCKER_FOLDER}/${DOCKER_COMPOSE_FILE} \
  down -v
