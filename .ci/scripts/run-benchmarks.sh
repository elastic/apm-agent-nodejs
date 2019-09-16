#!/usr/bin/env bash
set -ueo pipefail

SCRIPTPATH=$(dirname "$0")
source ./${SCRIPTPATH}/prepare-benchmarks-env.sh

RESULT_FILE=${1:-apm-agent-benchmark-results.json}

npm run bench:ci ${RESULT_FILE}
