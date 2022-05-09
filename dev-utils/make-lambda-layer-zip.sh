#!/bin/bash
#
# Make a Node.js APM Agent lambda layer zip file that can be published to AWS.
# https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html
#
# Note: This has the side-effect of modifying "./node_modules/...".
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

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

mkdir -p nodejs/node_modules/elastic-apm-node
(cd nodejs/node_modules/elastic-apm-node;
    # Use 'npm pack' to get the published files as a start.
    npm --loglevel=warn pack "$TOP"; # creates "elastic-apm-node-$ver.tgz"
    tar --strip-components=1 -xf elastic-apm-node-*.tgz;
    rm elastic-apm-node-*.tgz;
    # Then install the "package-lock.json"-dictated dependencies (excluding devDependencies).
    cp $TOP/package-lock.json ./;
    npm ci --omit=dev;
    rm package-lock.json)

echo ""
zip -q -r elastic-apm-node-lambda-layer.zip nodejs
echo "Created build/lambda-layer-zip/elastic-apm-node-lambda-layer.zip"

echo
echo "The lambda layer can be published as follows for dev work:"
echo "    aws lambda --output json publish-layer-version --layer-name '$USER-dev-elastic-apm-nodejs' --description '$USER dev Elastic APM Node.js agent lambda layer' --zip-file 'fileb://build/lambda-layer-zip/elastic-apm-node-lambda-layer.zip'"
