#!/usr/bin/env bash
set -exo pipefail

echo "Now updating package.json for version: ${1}"

# This is a 3-stage process because jq seems to stream data and
# will create an empty file if the write is not done atomically
mydir=$(mktemp -d "${TMPDIR:-/tmp/}$(basename $0).XXXXXXXXXXXX")
jq '.version = '\"${1}\" package.json > $mydir/package.json
cp $mydir/package.json package.json
