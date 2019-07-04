#!/usr/bin/env bash

set -e

function teardown() {
  if [ ! -z "$pid" ]
  then
    shutdownAPMServer
  fi
}

function startAPMServer() {
  echo "Starting mock APM Server..."
  node $utils/apm-server.js > $serverout &
  pid=$!
  echo "Mock APM Server running as pid $pid"

  sleep 1
}

function shutdownAPMServer() {
  echo "Shutting down mock APM Server (pid: $pid)..."
  kill $pid
  unset pid
}

function runBenchmark () {
  benchmark=$1

  sleep 1

  echo "Running benchmark $benchmark without agent..."
  node $benchmark > $appout_no_agent

  startAPMServer

  echo "Running benchmark $benchmark with agent..."
  AGENT=1 node $benchmark $pid > $appout_agent

  shutdownAPMServer

  echo "Analyzing results..."
  node $utils/analyzer.js $appout_agent $appout_no_agent $serverout
}

trap teardown EXIT

basedir=$(dirname $0)/..
utils=$basedir/utils
outputdir=$basedir/.tmp
serverout=$outputdir/server.json
appout_no_agent=$outputdir/app-no-agent.json
appout_agent=$outputdir/app-agent.json

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
