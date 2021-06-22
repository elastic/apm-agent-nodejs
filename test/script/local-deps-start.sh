#!/usr/bin/env bash

pg_ctl -D /usr/local/var/postgres start
mongod --fork --config /usr/local/etc/mongod.conf --pidfilepath /tmp/mongod.pid >/tmp/mongod.log 2>&1
elasticsearch -p /tmp/elasticsearch.pid --daemonize && echo 'waiting for elasticsearch to start...' && ./node_modules/.bin/wait-on tcp:9200
cassandra -p /tmp/cassandra.pid &> /tmp/cassandra.log
memcached -d -P /tmp/memcached.pid
redis-server /usr/local/etc/redis.conf --daemonize yes
mysql.server start

# Note: localstack is not included here because running localstack
# outside of Docker is deprecated/not supported.
