#!/usr/bin/env bash

set -e

if [ "$1" == "--help" ]
then
  echo "Usage:"
  echo "  run-benchmarks.sh [benchmark-file|all] [output-file] [node_version]"
  echo
  echo "If no benchmark file is provided, the default is to run all the benchmarks"
  echo "(can also be specified using the \"all\" keyword)"
  echo
  echo "node_version is required when running within the CI context for sudo purposes"
  echo
  echo "Examples:"
  echo "  run-benchmarks.sh                    - Run all benchmarks"
  echo "  run-benchmarks.sh all                - Run all benchmarks"
  echo "  run-benchmarks.sh all out.ndjson     - Run all benchmarks + store result in out.ndjson"
  echo "  run-benchmarks.sh foo.js             - Run foo.js benchmark"
  echo "  run-benchmarks.sh foo.js out.ndjson  - Run foo.js benchmark + store result in out.ndjson"
  echo
  exit
fi

function log() {
  msg=$1
  if [ ! -z "$DEBUG" ]
  then
    echo $msg
  fi
}

function teardown() {
  log "teardown..."
  if [ -n "$pid" ] ; then
    shutdownAPMServer
  fi
  if [ -n "${SUDO_COMMAND}" ] ; then
    if [ -d "${outputdir}" ] ; then
      chmod -R 777 "${outputdir}"
      ls -l "${outputdir}"
    fi
    if [ -f "${result_file}" ] ; then
      chmod 777 "${result_file}"
    fi
    HOME_CONFIG="${HOME}/.config"
    if [ -d "${HOME_CONFIG}" ] ; then
      chmod -R 777 "${HOME_CONFIG}"
    fi
    if [ -d "${NVM_DIR}" ] ; then
      chmod -R 777 "${NVM_DIR}"
    fi
    # A bit dramatic but as it runs under the sudo folder let's get it fix once
    chmod -R 777 "${HOME}"
  fi
}

function startAPMServer() {
  log "Starting mock APM Server..."
  node $utils/apm-server.js &
  pid=$!
  log "Mock APM Server running as pid $pid"

  sleep 1
}

function shutdownAPMServer() {
  log "Shutting down mock APM Server (pid: $pid)..."
  kill -SIGUSR2 $pid
  unset pid
}

function runBenchmark() {
  benchmark=$1

  sleep 1

  log "Running benchmark $benchmark without agent..."
  node $benchmark > $appout_no_agent

  startAPMServer

  log "Running benchmark $benchmark with agent..."
  AGENT=1 node $benchmark > $appout_agent

  shutdownAPMServer

  log "Analyzing results..."
  node $utils/analyzer.js $appout_agent $appout_no_agent $result_file
}

trap teardown TERM EXIT

basedir=$(dirname $0)/..
utils=$basedir/utils
outputdir=$basedir/.tmp
appout_no_agent=$outputdir/app-no-agent.json
appout_agent=$outputdir/app-agent.json
result_file=$2

rm -f $result_file # in case it's left over from an old run somehow
rm -fr $outputdir
mkdir -p $outputdir

# If running as sudo then prepare the environment
if [ -n "${SUDO_COMMAND}" ] ; then
  log "Running benchmark as sudo, let's re-prepare the node environment..."
  ./${basedir}/../../.ci/scripts/prepare-benchmarks-env.sh "${NODE_VERSION}"
  [ -e env_vars.sh ] && source env_vars.sh || echo "env_vars.sh not found"
fi

if [ "$1" == "all" ]
then
  benchmarks=($basedir/0*.js)
elif [ ! -z "$1" ]
then
  benchmarks=($1)
else
  benchmarks=($basedir/0*.js)
fi

for benchmark in "${benchmarks[@]}"; do
  runBenchmark "$benchmark"
done
