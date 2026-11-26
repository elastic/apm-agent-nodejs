#!/bin/bash
#
# Lint all .yml files in the repo.
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

# ---- support functions

function warn {
    echo "$(basename $0): warn: $*" >&2
}

# ---- mainline

# Guard against accidentally using this script with a node that is too old
# for 'js-yaml' (<10).
nodeVer=$(node --version)
nodeMajorVer=$(echo "$nodeVer" | cut -d. -f1 | cut -c2-)
if [[ $nodeMajorVer -lt 10 ]]; then
    warn "node version is too old for 'js-yaml': $nodeVer"
    exit 0
fi

cd $(dirname $0)/../ >/dev/null   # Run from repo top dir.
git ls-files | grep '\.yml$' | xargs -n1 ./node_modules/.bin/js-yaml >/dev/null
