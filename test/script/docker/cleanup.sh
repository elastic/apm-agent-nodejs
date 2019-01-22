#!/usr/bin/env bash
DOCKER_CONTAINERS=$(docker ps -a -q)

if [ -n "${DOCKER_CONTAINERS}" ]; then
  docker stop ${DOCKER_CONTAINERS}
  docker rm -v ${DOCKER_CONTAINERS} 
  docker volume prune -f
fi

exit 0
