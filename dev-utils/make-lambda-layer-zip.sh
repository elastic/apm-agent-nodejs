#!/bin/bash
#
# Make an APM Node.js agent lambda layer zip file with local repo changes
# that could be published to AWS and used for a dev/test lambda.
#
# Note: This is for development-only, the blessed path for building and
# publishing Lambda layers for this agent is in ".ci/Makefile".
#

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

TOP=$(cd $(dirname $0)/../ >/dev/null; pwd)
BUILD_DIR="$TOP/build/lambda-layer-zip"
TIMESTAMP=$(date -u '+%Y%m%dT%H%M%S')

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

npm --loglevel=warn pack "$TOP" # creates "elastic-apm-node-$ver.tgz"
npm init -y
npm install --global-style elastic-apm-node-*.tgz

mkdir nodejs
mv node_modules nodejs
zip -q -r elastic-apm-node-lambda-layer-dev-$TIMESTAMP.zip nodejs
echo "Created build/lambda-layer-zip/elastic-apm-node-lambda-layer-dev-$TIMESTAMP.zip"

echo
echo "Note: You can use the following command to publish this layer for dev work:"
echo "  aws lambda --output json publish-layer-version --layer-name '$USER-play-elastic-apm-nodejs' --description '$USER dev Elastic APM Node.js agent lambda layer' --zip-file 'fileb://build/lambda-layer-zip/elastic-apm-node-lambda-layer-dev-$TIMESTAMP.zip'"
