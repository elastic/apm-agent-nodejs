#!/usr/bin/env bash

# This is a wrapper script which runs the `generate_cc_changelog` application in a 
# container during the CI release stage. It prints its output to standard out. Use
# shell redirection to write the output to a file.

# The following variables are specific to this deployment paramaters for the apm-agent-nodejs
# GitHhub repository: https://github.com/elastic/apm-agent-nodejs

# This script expects that containers have already been built. To build and prepare containers
# for this script, run `.ci/scripts/prepare-release-containers.sh`

# The mount point internal to the Docker container where we want to operate on this repo
DOCKER_MOUNT_POINT=/src

# The name of the CHANGELOG file to search for relative to the mount point
CHANGELOG=CHANGELOG.asciidoc

# The repo to query for entries to be made to the log
REPO=elastic/apm-agent-nodejs

# The docker image that was built from the `generate_cc_changelog` project
IMAGE=generate_cc_changelog

POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -t|--token)
    GITHUB_TOKEN="$2"
    shift
    shift
    ;;
    -v|--version)
    VERSION="$2"
    shift
    shift
    ;;
    -p|--preview)
    PREVIEW="$2"
    shift
    shift
    ;;
    -h|--help)
    echo "Use: generate_changelog.sh --token abc123 --version 0.8.9 --preview true"
    exit 0
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done

docker run \
-v "$(pwd)":${DOCKER_MOUNT_POINT} \
${IMAGE} \
--tree ${DOCKER_MOUNT_POINT} \
--changelog ${DOCKER_MOUNT_POINT}/${CHANGELOG} \
--repo ${REPO} \
--token ${GITHUB_TOKEN} \
--release ${VERSION} \
--preview ${PREVIEW}
