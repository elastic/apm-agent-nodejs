#!/usr/bin/env bash

# This is a wrapper script to encapsulate calls like the following:
# docker run -v \"$(pwd)\":/src -t update_eol_doc --release {$env.RELEASE_VER} --doc /src/docs/upgrading.asciidoc > ./docs/upgrading.asciidoc"

# The mount point internal to the Docker container where we want to operate on this repo
DOCKER_MOUNT_POINT=/src

# The upgrading file, relative to the root of the repo.
UPGRADING=/docs/upgrading.asciidoc

# The docker image that was built from the `generate_cc_changelog` project
IMAGE=update_eol_doc

POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -v|--version)
    VERSION="$2"
    shift
    shift
    ;;
    -h|--help)
    echo "Use: generate_eol.sh --version 0.8.9"
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
--release ${VERSION} \
--doc ${DOCKER_MOUNT_POINT}${UPGRADING} \
