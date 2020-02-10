#!/usr/bin/env bash

source /usr/local/bin/bash_standard_lib.sh

grep "-" .ci/.jenkins_nodejs.yml | cut -d'-' -f2- | \
while read -r version;
do
    transformedVersion=$(echo "${version}" | sed 's#"##g' | cut -d":" -f2)
    imageName="apm-agent-nodejs"
    registryImageName="docker.elastic.co/observability-ci/${imageName}:${transformedVersion}"
    (retry 2 docker pull "${registryImageName}")
    docker tag "${registryImageName}" "node:${transformedVersion}"
done

docker-compose \
  --no-ansi \
  --log-level ERROR \
  -f .ci/docker/docker-compose-all.yml \
  pull --quiet --ignore-pull-failures
