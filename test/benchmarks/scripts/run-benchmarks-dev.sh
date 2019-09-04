#!/usr/bin/env bash

set -e

function log() {
  msg=$1
  if [ ! -z "$DEBUG" ]
  then
    echo $msg
  fi
}

function teardown() {
  if [ ! -z "$pid" ]
  then
    shutdownAPMServer
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

function runBenchmark () {
  benchmark=$1

  sleep 1

  log "Running benchmark $benchmark without agent..."
  node $benchmark > $appout_no_agent

  startAPMServer

  log "Running benchmark $benchmark with agent..."
  AGENT=1 node $benchmark > $appout_agent

  shutdownAPMServer

  log "Analyzing results..."
  node $utils/analyzer.js $result_file $appout_agent $appout_no_agent
}

trap teardown EXIT

basedir=$(dirname $0)/..
utils=$basedir/utils
outputdir=$basedir/.tmp
appout_no_agent=$outputdir/app-no-agent.json
appout_agent=$outputdir/app-agent.json
result_file=$outputdir/result.json

rm -fr $outputdir
mkdir -p $outputdir

if [ ! -z "$1" ]
then
  benchmarks=($1)
else
  benchmarks=($basedir/0*.js)
fi

for benchmark in "${benchmarks[@]}"; do
  runBenchmark "$benchmark"
done

echo "Stored Elasticsearch result document at: ${result_file}"
