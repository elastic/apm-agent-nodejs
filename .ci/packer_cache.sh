#!/usr/bin/env bash

source /usr/local/bin/bash_standard_lib.sh

ARCH=$(uname -m| tr '[:upper:]' '[:lower:]')

if [ "${ARCH}" != "x86_64" ] ; then
  echo "The existing docker images on ARM are not supported yet."
  exit 0
fi

if [ -x "$(command -v docker)" ]; then
  grep "-" .ci/.jenkins_nodejs.yml | cut -d'-' -f2- | \
  while read -r version;
  do
      transformedVersion=$(echo "${version}" | sed 's#"##g' | cut -d":" -f2)
      imageName="apm-agent-nodejs"
      registryImageName="docker.elastic.co/observability-ci/${imageName}:${transformedVersion}"
      (retry 2 docker pull "${registryImageName}")
  done
fi

if [ -x "$(command -v docker-compose)" ]; then
  docker-compose \
    --no-ansi \
    --log-level ERROR \
    -f .ci/docker/docker-compose-all.yml \
    pull --quiet --ignore-pull-failures
fi
