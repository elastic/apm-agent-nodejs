#!/usr/bin/env bash

set -o errexit

echo start postgres
pg_ctl -D /usr/local/var/postgres start

echo
echo start mongodb
mongod --fork --config /usr/local/etc/mongod.conf --pidfilepath /tmp/mongod.pid >/tmp/mongod.log 2>&1

echo
echo start elasticsearch
elasticsearch -p /tmp/elasticsearch.pid --daemonize && echo 'waiting for elasticsearch to start...' && ./node_modules/.bin/wait-on tcp:9200

echo
echo start cassandra
cassandra -p /tmp/cassandra.pid &> /tmp/cassandra.log

echo
echo start memcached
memcached -d -P /tmp/memcached.pid

echo
echo start redis
redis-server /usr/local/etc/redis.conf --daemonize yes

echo
echo start mysql
mysql.server start
