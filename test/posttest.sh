#!/usr/bin/env bash

if [ "$TRAVIS" != "true" ]; then
  killall postgres
  killall mongod
  redis-cli shutdown
  mysql.server stop
fi
