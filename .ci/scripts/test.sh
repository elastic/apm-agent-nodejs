#!/usr/bin/env bash
set -exo pipefail

DOCKER_FOLDER=.ci/docker
NODE_VERSION=${1:?Nodejs version missing NODE_VERSION is not set}
TAV_VERSIONS=${2}
IS_EDGE=${3:false}

case ${TAV_VERSIONS} in
  generic-pool|koa-router|handlebars|jade|pug|finalhandler|restify|fastify|mimic-response|got|bluebird|apollo-server-express|ws|graphql|express-graphql|hapi|express|express-queue)
    DOCKER_COMPOSE_FILE=docker-compose-node-test.yml
    ;;
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
  elasticsearch)
    DOCKER_COMPOSE_FILE=docker-compose-elasticsearch.yml
    ;;
  mysql|mysql2)
    DOCKER_COMPOSE_FILE=docker-compose-mysql.yml
    ;;
  *)
    DOCKER_COMPOSE_FILE=docker-compose-all.yml
    ;;
esac

## This will use RC/nightly node versions. It does NOT support TAV!
if [ "${IS_EDGE}" = "true" ]; then
  DOCKER_COMPOSE_FILE=docker-compose-edge.yml
fi

NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} \
ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS} \
NODE_VERSION=${NODE_VERSION} \
TAV_VERSIONS=${TAV_VERSIONS} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f ${DOCKER_FOLDER}/${DOCKER_COMPOSE_FILE} \
  up \
  --exit-code-from node_tests \
  --build \
  --remove-orphans \
  --abort-on-container-exit \
  node_tests
NODE_VERSION=${NODE_VERSION} docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f ${DOCKER_FOLDER}/${DOCKER_COMPOSE_FILE} \
  down -v
