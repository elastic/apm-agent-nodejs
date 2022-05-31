#!/usr/bin/env bash

set -euxo pipefail

# This script is present on workers but may not be present in a development
# environment.
if [ ${WORKSPACE+x} ]  # We are on a CI worker
then
  source /usr/local/bin/bash_standard_lib.sh
fi

readonly RETRIES=3

readonly DOCKER_REGISTRY_URL="$1"

readonly DOCKER_IMAGE_NAME="$2"

readonly DOCKER_TAG="$3"

readonly DOCKER_PUSH_IMAGE="$DOCKER_REGISTRY_URL/$DOCKER_IMAGE_NAME:$DOCKER_TAG"

readonly DOCKER_PUSH_IMAGE_LATEST="$DOCKER_REGISTRY_URL/$DOCKER_IMAGE_NAME:latest"

echo "INFO: Pushing image $DOCKER_PUSH_IMAGE to $DOCKER_REGISTRY_URL"

if [ ${WORKERS+x} ]  # We are on a CI worker
then
  retry $RETRIES docker push $DOCKER_PUSH_IMAGE || echo "Push failed after $RETRIES retries"
else  # We are in a local (non-CI) environment
  docker push $DOCKER_PUSH_IMAGE || echo "You may need to run 'docker login' first and then re-run this script"
fi

docker tag $DOCKER_PUSH_IMAGE $DOCKER_PUSH_IMAGE_LATEST
echo "INFO: Pushing image $DOCKER_PUSH_IMAGE_LATEST to $DOCKER_REGISTRY_URL"

if [ ${WORKERS+x} ]  # We are on a CI worker
then
  retry $RETRIES docker push $DOCKER_PUSH_IMAGE_LATEST || echo "Push failed after $RETRIES retries"
else  # We are in a local (non-CI) environment
  docker push $DOCKER_PUSH_IMAGE_LATEST || echo "You may need to run 'docker login' first and then re-run this script"
fi
