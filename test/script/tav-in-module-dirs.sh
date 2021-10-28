#!/bin/bash
#
# Run `tav` in each of the test/instrumentation/modules/$module dirs.
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

TAV=$(pwd)/node_modules/.bin/tav
find ./test/instrumentation/modules -name .tav.yml | while read f; do
    echo "-- $f"
    (cd $(dirname $f) && $TAV)
done
