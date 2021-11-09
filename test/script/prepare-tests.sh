#!/bin/bash
#
# Prepare for testing by 'npm install'ing in module test dirs with package.json
# files.
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

TESTDIR=$(cd $(dirname $0)/.. >/dev/null && pwd)

function fatal {
    echo "$(basename $0): error: $*"
    exit 1
}

ls $TESTDIR/instrumentation/modules/*/package.json | while read f; do
    d=$(dirname $f)
    echo "# $d"
    (cd $d && npm install)
done
