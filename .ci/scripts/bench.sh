#!/usr/bin/env bash

# Bash strict mode
set -eo pipefail

# Found current script directory
RELATIVE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Found project directory
BASE_PROJECT="$(dirname "$(dirname "${RELATIVE_DIR}")")"

# Run the microbenchmark in Buildkite and for such
# it configures the required settings in the Buildkite runners
# to execute the benchmarks afterwards

## Buildkite specific configuration
if [ "${CI}" == "true" ] ; then
  # If HOME is not set then use the Buildkite workspace
  # that's normally happening when running in the CI
  # owned by Elastic.
  if [ -z "${HOME}" ] ; then
    HOME="${BUILDKITE_BUILD_CHECKOUT_PATH}"
    export HOME
  fi
fi

# Run benchmark
echo "--- Execute benchmarks"
"${BASE_PROJECT}/.ci/scripts/run-benchmarks.sh" "apm-agent-benchmark-results.json" "$(cat "${BASE_PROJECT}/.nvmrc")"

echo "--- Send benchmark results"
sendBenchmark "${ES_USER_SECRET}" "${ES_PASS_SECRET}" "${ES_URL_SECRET}" "apm-agent-benchmark-results.json"
