#!/bin/bash
#
# List the jobs for the latest "TAV" workflow run in GH Actions, **sorted by
# slowest last**. This is used for finding very slow build steps as candidates
# for improvement.
#
# Usage:
#   ./dev-utils/ci-tav-slow-jobs.sh
#
# The columns are:
#   1. duration in seconds
#   2. duration in "NNmNNs"
#   3. the job name

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

branch=main
latestTavRun=$(gh run list -R elastic/apm-agent-nodejs -b "$branch" -w TAV -L 1 --json databaseId --jq '.[].databaseId')
gh api --paginate repos/elastic/apm-agent-nodejs/actions/runs/$latestTavRun/jobs \
    | json -ga jobs \
    | json -ga -e '
        this.s = (new Date(this.completed_at) - new Date(this.started_at)) / 1000;
        this.minSec = Math.floor(this.s/60) + "m" + (this.s%60).toString().padStart(2,"0") + "s"
        ' s minSec name \
    | sort -n
