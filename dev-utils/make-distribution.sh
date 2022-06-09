#!/bin/bash
#
# Make a Node.js APM agent distribution that is used as follows:
# - "build/dist/elastic-apm-node-lambda-layer.zip" is published to AWS as a
#   Lambda layer (https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
# - "build/dist/nodejs/..." is used to build a Docker image of the APM agent
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
BUILD_DIR="$TOP/build/dist"

# Guard against accidentally using this script with a too-old npm.
if [[ $(npm --version | cut -d. -f1) -lt 8 ]]; then
    fatal "npm version is too old for 'npm ci --omit=dev': $(npm --version)"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

mkdir -p nodejs/node_modules/elastic-apm-node
(cd nodejs/node_modules/elastic-apm-node;
    # Use 'npm pack' to get the published files as a start.
    npm --loglevel=warn pack "$TOP"; # creates "elastic-apm-node-$ver.tgz"
    tar --strip-components=1 -xf elastic-apm-node-*.tgz;
    rm elastic-apm-node-*.tgz;
    cp $TOP/package-lock.json ./;
    # Then install the "package-lock.json"-dictated dependencies (excluding
    # devDependencies).  Use '--ignore-scripts' to have confidence no code but
    # ours and npm's is running.
    npm ci --omit=dev --ignore-scripts;
    rm package-lock.json)

# Generate a NOTICE file including the licenses of all included deps.
NOTICE=nodejs/node_modules/elastic-apm-node/NOTICE.md
$TOP/dev-utils/gen-notice.sh nodejs/node_modules/elastic-apm-node >$NOTICE

echo ""
zip -q -r elastic-apm-node-lambda-layer.zip nodejs
echo "Created build/dist/elastic-apm-node-lambda-layer.zip"

echo
echo "The lambda layer can be published as follows for dev work:"
echo "    aws lambda --output json publish-layer-version --layer-name '$USER-dev-elastic-apm-node' --description '$USER dev Elastic APM Node.js agent lambda layer' --zip-file 'fileb://build/dist/elastic-apm-node-lambda-layer.zip'"
