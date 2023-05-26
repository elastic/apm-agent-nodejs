#!/usr/bin/env bash
set -eo pipefail

# Run the microbenchmark in Buildkite and for such
# it configures the required settings in the Buildkite runners
# to execute the benchmarks afterwards

## Buildkite specific configuration
if [ "$CI" == "true" ] ; then

  echo "--- Configure Buildkite worker"
	# If HOME is not set then use the Buildkite workspace
	# that's normally happening when running in the CI
	# owned by Elastic.
	if [ -z "$HOME" ] ; then
		HOME=$BUILDKITE_BUILD_CHECKOUT_PATH
		export HOME
	fi

	# required when running the benchmark
	PATH=$PATH:$HOME/.local/bin
	export PATH

	echo 'Docker login is done in the Buildkite hooks'
fi

.ci/scripts/run-benchmarks.sh "apm-agent-benchmark-results.json" "14"

echo "--- Send benchmarks"
sendBenchmark "$ES_USER_SECRET" "$ES_PASS_SECRET" "$ES_URL_SECRET" "apm-agent-benchmark-results.json"
