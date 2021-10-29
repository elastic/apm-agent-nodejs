#!/bin/bash
#
# Dump a table of the "Run Tests" build steps in a given Jenkins build for this
# project, *sorted by duration*. The main use case is for finding very slow
# build steps as candidates for improvement.
#
# Usage:
#   ./dev-utils/jenkins-build-slow-steps.sh [JENKINS_BUILD_URL_OR_NUM]
#
# Examples:
#   ./dev-utils/jenkins-build-slow-steps.sh https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/job/master/1137/
#   ./dev-utils/jenkins-build-slow-steps.sh 1137   # ditto
#   ./dev-utils/jenkins-build-slow-steps.sh https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/job/PR-2181/75/
#
# The output looks like:
#   ...
#   1504058 FINISHED SUCCESS .ci/scripts/test.sh -b "release" -t "apollo-server-express" "12"
#   1746062 FINISHED SUCCESS .ci/scripts/test.sh -b "release" -t "apollo-server-express" "14"
#   1793559 FINISHED SUCCESS .ci/scripts/test.sh -b "release" -t "aws-sdk" "10"
#
# The columns are:
#   1. duration in ms
#   2. state
#   3. result
#   4. The test command that was run. One should be able to run this locally.

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

# ---- support functions

function fatal {
    echo "$(basename $0): error: $*"
    exit 1
}

# ---- mainline

if ! which json >/dev/null 2>/dev/null; then
    fatal "missing 'json' utility: install it from https://github.com/trentm/json#installation"
fi

JENKINS_BUILD_URL_OR_NUM="$1"
if [[ -z "$JENKINS_BUILD_URL_OR_NUM" ]]; then
    fatal "missing JENKINS_BUILD_URL_OR_NUM argument"
fi

steps_info_url=
# If "JENKINS_BUILD_URL_OR_NUM" is a number, default to that master build.
if [[ "$JENKINS_BUILD_URL_OR_NUM" =~ ^[0-9]+$ ]]; then
    steps_info_url=https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/job/master/$JENKINS_BUILD_URL_OR_NUM/artifact/steps-info.json
else
    steps_info_url=$JENKINS_BUILD_URL_OR_NUM/artifact/steps-info.json
fi

curl -s "$steps_info_url" \
    | json -c 'this.displayName==="Run Tests"' -ga durationInMillis state result displayDescription \
    | sort -n -k1
