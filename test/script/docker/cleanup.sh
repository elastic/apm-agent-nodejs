#!/usr/bin/env bash

docker stop $(docker ps -a -q) 
docker rm -v $(docker ps -q -a) 

exit 0
