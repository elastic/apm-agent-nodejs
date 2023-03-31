#!/usr/bin/env bash
set -e

echo "versions=$(jq -c .versions .ci/tav.json)" >> $GITHUB_OUTPUT
echo "modules=$(jq -c .modules .ci/tav.json)" >> $GITHUB_OUTPUT
echo "pull-request=${PR_NUMBER}" >> $GITHUB_OUTPUT
