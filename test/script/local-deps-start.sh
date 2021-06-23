#!/usr/bin/env bash

pg_ctl -D /usr/local/var/postgres start
mongod --fork --config /usr/local/etc/mongod.conf --pidfilepath /tmp/mongod.pid >/tmp/mongod.log 2>&1
elasticsearch -p /tmp/elasticsearch.pid --daemonize && echo 'waiting for elasticsearch to start...' && ./node_modules/.bin/wait-on tcp:9200
cassandra -p /tmp/cassandra.pid &> /tmp/cassandra.log
memcached -d -P /tmp/memcached.pid
redis-server /usr/local/etc/redis.conf --daemonize yes
mysql.server start

# Note: Running a "local" (i.e. outside of Docker) localstack is deprecated/not
# supported. So we run it in Docker.
docker run --name dev-localstack -d --rm -e SERVICES=s3 -p 4566:4566 localstack/localstack

