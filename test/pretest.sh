#!/usr/bin/env bash

if [ "$TRAVIS" != "true" ]; then
  postgres -D /usr/local/var/postgres >/tmp/postgres.log 2>&1 &
  mongod --fork --config /usr/local/etc/mongod.conf >/tmp/mongod.log 2>&1
  elasticsearch -p /tmp/elasticsearch.pid --daemonize && echo 'waiting for elasticsearch to start...' && wait-on tcp:9200
  redis-server /usr/local/etc/redis.conf --daemonize yes
  mysql.server start
fi
