#!/usr/bin/env bash

set -exo pipefail

SCRIPTPATH=$(dirname "$0")
RESULT_FILE=${1}
NODE_VERSION=${2}

if [[ -z "$1" || -z "$2" ]]; then
  echo "Usage:"
  echo "  run-benchmarks-ci.sh <output-file> <node-version>"
  echo
  echo "Example: Run benchmark with node v14, store result in out.ndjson"
  echo "  run-benchmarks-ci.sh out.ndjson 14"
  echo
  exit 1
fi

echo $(pwd)

# Share this 'setUp' implementation with
# https://github.com/elastic/apm-agent-java/blob/main/scripts/jenkins/run-benchmarks.sh
function setUp() {
    echo "Setting CPU frequency to base frequency"

    CPU_MODEL=$(lscpu | grep "Model name" | awk '{for(i=3;i<=NF;i++){printf "%s ", $i}; printf "\n"}')
    if [ "${CPU_MODEL}" == "Intel(R) Xeon(R) CPU E3-1246 v3 @ 3.50GHz " ]
    then
        # could also use `nproc`
        CORE_INDEX=7
        BASE_FREQ="3.5GHz"
    elif [ "${CPU_MODEL}" == "Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz " ]
    then
        CORE_INDEX=7
        BASE_FREQ="3.4GHz"
    elif [ "${CPU_MODEL}" == "Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz " ]
    then
        CORE_INDEX=7
        BASE_FREQ="3.6GHz"
    elif [ "${CPU_MODEL}" == "Intel(R) Core(TM) i9-8950HK CPU @ 2.90GHz " ]
    then
        CORE_INDEX=9
        BASE_FREQ="2.90GHz"
    elif [ "${CPU_MODEL}" == "12th Gen Intel(R) Core(TM) i5-12500 " ]
    then
        CORE_INDEX=11
        BASE_FREQ="3.0GHz"
    else
        >&2 echo "Cannot determine base frequency for CPU model [${CPU_MODEL}]. Please adjust the build script."
        exit 1
    fi
    MIN_FREQ=$(cpufreq-info -l -c 0 | awk '{print $1}')
    # This is the frequency including Turbo Boost. See also http://ark.intel.com/products/80916/Intel-Xeon-Processor-E3-1246-v3-8M-Cache-3_50-GHz
    MAX_FREQ=$(cpufreq-info -l -c 0 | awk '{print $2}')

    # set all CPUs to the base frequency
    for (( cpu=0; cpu<=${CORE_INDEX}; cpu++ ))
    do
        sudo -n cpufreq-set -c ${cpu} --min ${BASE_FREQ} --max ${BASE_FREQ}
    done

    # Build cgroups to isolate microbenchmarks and JVM threads
    echo "Creating groups for OS and microbenchmarks"
    # Isolate the OS to the first core
    sudo -n cset set --set=/os --cpu=0-1
    sudo -n cset proc --move --fromset=/ --toset=/os

    # Isolate the microbenchmarks to all cores except the first two (first physical core)
    # On a 4 core CPU with hyper threading, this would be 6 cores (3 physical cores)
    sudo -n cset set --set=/benchmark --cpu=2-${CORE_INDEX}
}

function escape_quotes() {
    echo $1 | sed -e 's/"/\\"/g'
}

# Escapes double quites in environment variables so that they are exported correctly
function safe_env_export() {
    echo "export $1=\"$(escape_quotes "${2}")\""
}

function benchmark() {
    # sha and BRANCH_NAME are variables passed throught the GitHub action
    echo "export BRANCH_NAME='${BRANCH_NAME}'" > env_vars.sh
    echo "export GIT_BASE_COMMIT='${sha}'" >> env_vars.sh
    # Needed by the benchmark script
    echo "export GIT_BUILD_CAUSE='${GITHUB_EVENT_NAME}'" >> env_vars.sh
    echo "export GIT_COMMIT='${sha}'" >> env_vars.sh
    sudo -n cset proc --exec /benchmark -- ./"${SCRIPTPATH}"/run-benchmarks.sh all "${RESULT_FILE}" "${NODE_VERSION}"
}

function tearDown() {
    echo "Destroying cgroups"
    sudo -n cset set --destroy /os
    sudo -n cset set --destroy /benchmark

    echo "Setting normal frequency range"
    for (( cpu=0; cpu<=${CORE_INDEX}; cpu++ ))
    do
        sudo -n cpufreq-set -c ${cpu} --min ${MIN_FREQ} --max ${MAX_FREQ}
    done

    echo "Delete env_vars.sh"
    rm env_vars.sh || true
}

trap "tearDown" TERM EXIT

setUp
benchmark
