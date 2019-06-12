ARG NODE_VERSION=8
FROM node:${NODE_VERSION}

#RUN id && npm install -g yarn && yarn global upgrade npm@latest
WORKDIR /tmp
RUN mkdir -p /tmp/node_modules \
  && npm install npm \
  && rm /usr/local/bin/npm \
  && ln -s /tmp/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

RUN node --version && npm --version

WORKDIR /app
