#!/usr/bin/env bash

set -e

function teardown() {
  if [ ! -z "$pid" ]
  then
    echo "Shutting down mock APM Server (pid: $pid)..."
    kill $pid
    unset pid
  fi
}

function runBenchmark () {
  benchmark=$1

  sleep 1

  echo "Starting mock APM Server..."
  node $utils/apm-server.js > $serverout &
  pid=$!
  echo "Mock APM Server running as pid $pid"

  sleep 1

  echo "Running benchmark $benchmark..."
  node $benchmark $pid > $appout

  echo "Analyzing results..."
  node $utils/analyzer.js $appout $serverout

  teardown
}

trap teardown EXIT

basedir=$(dirname $0)/..
utils=$basedir/utils
outputdir=$basedir/.tmp
serverout=$outputdir/server.json
appout=$outputdir/app.json

rm -f $serverout
rm -f $appout
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
