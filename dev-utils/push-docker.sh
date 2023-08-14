#!/usr/bin/env bash

# Publish (push) the given locally built Docker image.  If 'v${IMAGE_TAG}'
# matches the latest git tag, then the image is also published with the 'latest'
# tag.
#
# This assumes that 'docker login REGISTRY' has already been done.
#
# Usage:
#   ./dev-utils/push-docker.sh REGISTRY IMAGE_NAME IMAGE_TAG
# Example:
#   ./dev-utils/push-docker.sh docker.elastic.co observability/apm-agent-nodejs 3.49.1

set -euo pipefail

readonly DOCKER_REGISTRY_URL="$1"
readonly DOCKER_IMAGE_NAME="$2"
readonly DOCKER_TAG="$3"
readonly DOCKER_PUSH_IMAGE="$DOCKER_REGISTRY_URL/$DOCKER_IMAGE_NAME:$DOCKER_TAG"
readonly DOCKER_PUSH_IMAGE_LATEST="$DOCKER_REGISTRY_URL/$DOCKER_IMAGE_NAME:latest"

echo "INFO: Pushing docker image $DOCKER_PUSH_IMAGE"
docker push "$DOCKER_PUSH_IMAGE"

# The latest (by semver version ordering) git version tag, with the 'v' removed.
readonly LATEST_GIT_TAG=$(git tag --list --sort=version:refname "v*" | grep -v - | cut -c2- | tail -n1)

if [[ "$DOCKER_TAG" == "$LATEST_GIT_TAG" ]]; then
  echo "INFO: Docker tag '$DOCKER_TAG' matches latest git version tag, tagging and pushing $DOCKER_PUSH_IMAGE_LATEST"
  docker tag $DOCKER_PUSH_IMAGE $DOCKER_PUSH_IMAGE_LATEST
  docker push $DOCKER_PUSH_IMAGE_LATEST
fi
