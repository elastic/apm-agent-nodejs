ARG NODE_VERSION 
FROM node:${NODE_VERSION}

RUN apt-get update && \
    apt-get install -y xsltproc libxml2-utils && \
    rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

WORKDIR /app
