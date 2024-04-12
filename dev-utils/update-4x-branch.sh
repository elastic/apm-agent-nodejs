#!/bin/bash
#
# Create a PR to update the 4.x branch to match the state of "main" for the
# just-tagged release. The 4.x branch needs to be updated for the current docs
# build.
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

function fatal {
    echo "$(basename $0): error: $*"
    exit 1
}

# json=./node_modules/.bin/json
# if [ ! -f "$json" ]; then
#     echo "Requirements:"
#     echo "   - install npm dependencies"
#     echo "   - cd into root folder of the project"
#     echo "Usage:"
#     echo "   ./dev-utils/ci-tav-slow-jobs.sh"
#     exit 1;
# fi


# branch=main
# latestCompletedTavRun=$(gh run list -R elastic/apm-agent-nodejs -b "$branch" -w TAV -L5 --json status,databaseId | $json -c 'this.status==="completed"' | $json 0.databaseId)
# gh api --paginate repos/elastic/apm-agent-nodejs/actions/runs/$latestCompletedTavRun/jobs \
#     | $json -ga jobs \
#     | $json -ga -e '
#         this.s = (new Date(this.completed_at || Date.now()) - new Date(this.started_at)) / 1000;
#         this.minSec = Math.floor(this.s/60) + "m" + (this.s%60).toString().padStart(2,"0").slice(0,2) + "s"
#         ' s minSec name \
#     | sort -n

TOP=$(cd $(dirname $0)/../ >/dev/null; pwd)
WRKDIR=${TOP}/build/update-4x-branch

echo "# Creating working git clone in: ${WRKDIR}/apm-agent-nodejs"
rm -rf $WRKDIR
mkdir -p $WRKDIR
cd $WRKDIR
git clone git@github.com:elastic/apm-agent-nodejs.git
cd apm-agent-nodejs

TARGTAG=$(git tag --points-at HEAD)
if [[ ! ("$TARGTAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]$) ]]; then
    fatal "the tag on HEAD, '${TARGTAG}', does not look like a release tag"
fi
# echo "TARGTAG=$TARGTAG"

LASTTAG=$(
    git log --pretty=format:%h -30 | tail -n +2 | while read sha; do
        possible=$(git tag --points-at $sha)
        if [[ "$possible" =~ ^v[0-9]+\.[0-9]+\.[0-9]$ ]]; then
            echo $possible
            break
        fi
    done
)
if [[ -z "$LASTTAG" ]]; then
    fatal "could not find previous release tag in last 30 commits"
fi
# echo "LASTTAG=$LASTTAG"


# Merging generally fails, IME. Let's attempt to cherry-pick each commit.
# - That 'awk' command is to reverse the lines of commit shas.
#   `tac` works on Linux, `tail -r` works on BSD/macOS.
#   https://stackoverflow.com/a/744093/14444044
echo
echo "# Creating PR to update 4.x branch with commits from $LASTTAG to $TARGTAG."
FEATBRANCH=update-4x-branch-$(date +%Y%m%d)
git checkout 4.x
git checkout -b "$FEATBRANCH"
git log --pretty=format:"%h" $LASTTAG...$TARGTAG \
    | awk '{a[i++]=$0} END {for (j=i-1; j>=0;) print a[j--] }' \
    | while read sha; do
        echo "$ git cherry-pick $sha"
        git cherry-pick $sha
    done

echo
echo "# You can create a PR now with:"
echo "    cd $WRKDIR/apm-agent-nodejs"
echo "    gh pr create --fill -w -B 4.x -t 'docs: update 4.x branch for $TARGTAG release'"

