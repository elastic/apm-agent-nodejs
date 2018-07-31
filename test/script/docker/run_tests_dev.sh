#!/usr/bin/env bash

number_of_started_containers () {
  echo "$(docker ps --format '{{.ID}}' | wc -l | awk '{$1=$1};1')"
}

number_of_healthy_containers () {
  echo "$(docker ps -f health=healthy --format '{{.ID}}' | wc -l | awk '{$1=$1};1')"
}

wait_for_healthy () {
  local n=1
  local max=99

  until [[ $n -ge $max ]]
  do
    healthy=$(number_of_healthy_containers)
    echo -ne "[check $n of $max] Docker healthcheck status: $healthy of $expected_healthy\033[0K\r"
    test $healthy -eq $expected_healthy && break
    n=$[$n+1]
    sleep 5
  done
  echo

  if [ $n -ge $max ]; then exit 1; fi
}

setup_env () {
  for service in "${service_arr[@]}"
  do
    if [ "$service" == "postgres" ]
    then
      export PGUSER=postgres
    fi
  done
}

run_test_suite () {
  if [ -z "$COVERAGE" ]
  then
    npm run test-suite
  else
    npm run test-suite-coverage
  fi
}

if [ "$1" == "all" ]
then
  # run the tests inside docker
  if [ -z "$2" ]
  then
    node_version=`node --version | cut -d . -f 1 | cut -c 2-`
  else
    node_version=$2
  fi
  ./test/script/docker/run_tests.sh $node_version $3
  exit $?
elif [ "$1" == "none" ]
then
  run_test_suite
  exit $?
elif [ $# -gt 0 ]
then
  # if dependency whitelist is given in arguemnts, use those
  services=$@
else
  # else fall back to ALL dependencies
  services=$(docker-compose  -f ./test/docker-compose.yml  config --services)
fi

service_arr=( $services )
total_services=${#service_arr[@]}
expected_healthy=$total_services
healthy=$(number_of_healthy_containers)
expected_containers=$total_services
containers=$(number_of_started_containers)

if [[ $healthy -lt $expected_healthy && $containers -eq $expected_containers ]]
then
  wait_for_healthy
  setup_env
  run_test_suite
elif [[ $healthy -lt $expected_healthy || $containers -lt $expected_containers ]]
then
  finish () {
    docker-compose -f ./test/docker-compose.yml down
  }
  trap finish EXIT

  docker-compose -f ./test/docker-compose.yml up -d $services
  wait_for_healthy
  setup_env
  run_test_suite
else
  run_test_suite
fi
