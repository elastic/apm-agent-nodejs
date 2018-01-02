#!/usr/bin/env bash

if [[ "$CI" != "true" ]]; then
  pg_ctl -D /usr/local/var/postgres start
  mongod --fork --config /usr/local/etc/mongod.conf --pidfilepath /tmp/mongod.pid >/tmp/mongod.log 2>&1
  elasticsearch -p /tmp/elasticsearch.pid --daemonize && echo 'waiting for elasticsearch to start...' && ./node_modules/.bin/wait-on tcp:9200
  redis-server /usr/local/etc/redis.conf --daemonize yes
  mysql.server start
fi
