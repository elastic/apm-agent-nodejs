#!/usr/bin/env bash

if [ "$TRAVIS" != "true" ]; then
  postgres -D /usr/local/var/postgres >/tmp/postgres.log 2>&1 &
  mongod --fork --config /usr/local/etc/mongod.conf >/tmp/mongod.log 2>&1
  redis-server /usr/local/etc/redis.conf --daemonize yes
  mysql.server start
fi
