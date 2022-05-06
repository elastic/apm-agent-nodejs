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
#     .ci/scripts/tests.sh [-b release|rc|nightly] [-f] [-t TAV_MODULE] NODE_VERSION
#
# - NODE_VERSION is a version of Node.js, e.g. "14", usable both to select
#   a image from Docker Hub:
#       docker pull docker.io/library/node:$NODE_VERSION
#   and to install Node with nvm:
#       nvm install $NODE_VERSION
# - TAV_MODULE, if specified, will result in "test-all-versions" (TAV) tests
#   being run. It identifies the name of a module in ".tav.yml", e.g. "redis" or
#   "pg". If this argument is not given then the regular agent tests (i.e. the
#   same as 'npm test') will be run.
# - The "-b" option (BUILD_TYPE) can be used to test with pre-release "rc" or
#   "nightly" builds of Node.js. This will skip out if there is already a
#   release build for the given version.
# - The "-f" option (FORCE) can be used to force a "nightly" or "rc" test,
#   even if there is already a release build for the same version.
#
# Examples:
#     .ci/scripts/test.sh 14                # run agent tests against latest docker:14 image
#     .ci/scripts/test.sh -b release 14     # same
#     .ci/scripts/test.sh 8.6               # run agent tests against latest docker:8.6 image
#     .ci/scripts/test.sh -t redis 14       # run redis TAV tests against latest docker:14 image
#     .ci/scripts/test.sh -b nightly 17     # run agent tests against the latest v17 node.js nightly build
#     .ci/scripts/test.sh -f -b nightly 17  # ... same, but force doing tests even if there
#                                           #     is already a node.js v17 release
#

set -eo pipefail

function fatal {
  echo "$(basename $0): error: $*" >&2
  exit 1
}

function usage {
  echo "usage:"
  echo "  .ci/scripts/test.sh [-b release|rc|nightly] [-f] [-t TAV_MODULE] NODE_VERSION"
  echo ""
  echo "options:"
  echo "  -h                      Show this help and exit."
  echo "  -b release|rc|nightly   Node.js build type. Defaults to a 'release' build."
  echo "  -f                      Force a build. By default this script will"
  echo "                          skip a 'rc' or 'nightly' build if there isn't"
  echo "                          one available for the given NODE_VERSION or if"
  echo "                          there is already a release build for the same"
  echo "                          version"
  echo "  -t TAV_MODULE           A module for which to do TAV tests."
}


function skip {
  local reason="$1"
  echo "$reason"

  # This creates a "*-output.tap" file, which the 'generateStep()' function
  # in .ci/Jenkinsfile currently expects from this test run.
  echo "TAP version 13
ok 1 - test suite # SKIP $reason
1..1
" > test-suite-output.tap

  exit 0
}


# ---- Process args

FORCE=false
TAV_MODULE=
BUILD_TYPE=release

while getopts "hb:ft:" opt; do
  case "$opt" in
    h)
      usage
      exit 0
      ;;
    b)
      BUILD_TYPE=$OPTARG
      ;;
    f)
      FORCE=true
      ;;
    t)
      TAV_MODULE=$OPTARG
      ;;
    *)
      fatal "unknown option: -$opt"
      ;;
  esac
done

# Should have only one argument left.
if [[ $OPTIND -ne $# ]]; then
  fatal "incorrect number of arguments: $@"
fi
shift $(($OPTIND - 1))
NODE_VERSION="$1"

# Determine NVM_NODEJS_ORG_MIRROR from BUILD_TYPE.
case "$BUILD_TYPE" in
  release)
    # Leave empty, nvm will default to: https://nodejs.org/dist
    NVM_NODEJS_ORG_MIRROR=
    ;;
  nightly)
    NVM_NODEJS_ORG_MIRROR=https://nodejs.org/download/nightly
    ;;
  rc)
    NVM_NODEJS_ORG_MIRROR=https://nodejs.org/download/rc
    ;;
  *)
    fatal "invalid BUILD_TYPE: $BUILD_TYPE"
    ;;
esac

if [[ -z "$TAV_MODULE" ]]; then
  echo "Running Agent tests with node v$NODE_VERSION (BUILD_TYPE=$BUILD_TYPE, FORCE=$FORCE)"
else
  echo "Running '$TAV_MODULE' TAV tests with node v$NODE_VERSION (BUILD_TYPE=$BUILD_TYPE, FORCE=$FORCE)"
fi

# Turn on xtrace output only after processing args.
export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
set -o xtrace


# ---- For nightly and rc builds, determine if there is a point in testing.

if [[ $BUILD_TYPE != "release" && $FORCE != "true" ]]; then
  # If there is no nightly/rc build for this version, then skip.
  #
  # Note: We are relying on new releases being added to the top of index.tab,
  # which currently seems to be the case.
  index_tab_content=$(curl -sS "${NVM_NODEJS_ORG_MIRROR}/index.tab" \
    | (grep "^v${NODE_VERSION}" || true) | awk '{print $1}')
  if [[ $BUILD_TYPE == "nightly" ]]; then
    # Select the *penultimate* nightly to avoid an occasional race where
    # the nightly build has been added to index.tab, but the built
    # packages are not yet uploaded (sometimes for as long as an hour).
    edge_node_version=$(echo "$index_tab_content" | head -2 | tail -1)
  else
    # Use the latest available rc build.
    edge_node_version=$(echo "$index_tab_content" | head -1)
  fi
  if [[ -z "$edge_node_version" ]]; then
    skip "No ${BUILD_TYPE} build of Node v${NODE_VERSION} was found. Skipping tests."
  fi

  # If there is already a *release* build for this same version, then there is
  # no point in testing against this node version, so skip out.
  possible_release_version=${edge_node_version%-*}  # remove "-*" suffix
  release_version=$(curl -sS https://nodejs.org/dist/index.tab \
    | (grep -E "^${possible_release_version}\>" || true) | awk '{print $1}')
  if [[ -n "$release_version" ]]; then
    skip "There is already a release build (${release_version}) of the latest v${NODE_VERSION} ${BUILD_TYPE} (${edge_node_version}). Skipping tests."
  fi

  # Explicitly pass this version to the 'nvm install ...'.
  NODE_FULL_VERSION=${edge_node_version}
fi


# ---- Run the tests

# Select a config for 'docker-compose build' that sets up (a) the "node_tests"
# container where the tests are actually run and (b) any services that are
# needed for this set of tests, if any.
if [[ "${BUILD_TYPE}" = "rc" || "${BUILD_TYPE}" = "nightly" ]]; then
  # This will run the regular tests against rc and nightly builds of
  # node.js. It does NOT support TAV tests.
  if [[ -n "${TAV_MODULE}" ]]; then
    fatal "running TAV tests (TAV_MODULE=${TAV_MODULE}) with BUILD_TYPE=${BUILD_TYPE} is not supported"
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
    mongodb|mongodb-core)
      DOCKER_COMPOSE_FILE=docker-compose-mongodb.yml
      ;;
    pg|knex)
      DOCKER_COMPOSE_FILE=docker-compose-postgres.yml
      ;;
    cassandra-driver)
      DOCKER_COMPOSE_FILE=docker-compose-cassandra.yml
      ;;
    elasticsearch|@elastic/elasticsearch|@elastic/elasticsearch-canary)
      DOCKER_COMPOSE_FILE=docker-compose-elasticsearch.yml
      ;;
    mysql|mysql2)
      DOCKER_COMPOSE_FILE=docker-compose-mysql.yml
      ;;
    memcached)
      DOCKER_COMPOSE_FILE=docker-compose-memcached.yml
      ;;
    aws-sdk)
      DOCKER_COMPOSE_FILE=docker-compose-localstack.yml
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

ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS:-true}

set +e
NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} \
ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS} \
NODE_VERSION=${NODE_VERSION} \
NODE_FULL_VERSION=${NODE_FULL_VERSION} \
TAV_MODULE=${TAV_MODULE} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f .ci/docker/${DOCKER_COMPOSE_FILE} \
  build >docker-compose.log 2>docker-compose.err

if [ $? -gt 0 ] ; then
  echo "error: 'docker-compose build ...' failed, see the below log output"
  cat docker-compose.log && rm docker-compose.log
  cat docker-compose.err && rm docker-compose.err
  exit 1
fi

set +e
NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR} \
ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS} \
NODE_VERSION=${NODE_VERSION} \
NODE_FULL_VERSION=${NODE_FULL_VERSION} \
TAV_MODULE=${TAV_MODULE} \
USER_ID="$(id -u):$(id -g)" \
docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f .ci/docker/${DOCKER_COMPOSE_FILE} \
  up \
  --exit-code-from node_tests \
  --remove-orphans \
  --abort-on-container-exit \
  node_tests

if [ $? -gt 0 ] ; then
  echo "error: 'docker-compose up ...' failed"
  # Dump inspect details on all containers. The "State.Healthcheck" key may
  # contain helpful info on unhealthy containers.
  docker inspect $(docker ps -q)
  exit 1
fi

if ! NODE_VERSION=${NODE_VERSION} docker-compose \
    --no-ansi \
    --log-level ERROR \
    -f .ci/docker/${DOCKER_COMPOSE_FILE} \
    down -v --remove-orphans; then
  # Workaround for this commonly seen error:
  #   error while removing network: network docker_default id $id has active endpoints
  echo "error: Unexpected error in 'docker-compose down ...'. Forcing removal of unused networks."
  docker network inspect docker_default || true
  docker network inspect -f '{{range .Containers}}{{ .Name }} {{end}}' docker_default || true
  docker network prune --force || true
fi
