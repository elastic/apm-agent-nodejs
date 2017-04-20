#!/usr/bin/env bash

if [ "$TRAVIS" != "true" ]; then
  killall postgres
  killall mongod
  kill `cat /tmp/elasticsearch.pid`
  redis-cli shutdown
  mysql.server stop
fi
