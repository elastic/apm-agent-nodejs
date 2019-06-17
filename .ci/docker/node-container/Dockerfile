ARG NODE_VERSION=8
FROM node:${NODE_VERSION}

WORKDIR /npm
RUN ( [ "${NODE_VERSION%%.*}" -le 8  ] \
  && echo "Node.js ${NODE_VERSION} - Manual install npm" \
  && mkdir -p /npm/node_modules \
  && npm install npm \
  && rm /usr/local/bin/npm \
  && ln -s /npm/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm ) || exit 0

RUN ( [ "${NODE_VERSION%%.*}" -gt 8  ] \
  && echo "Node.js ${NODE_VERSION} - upgrade npm" \
  && npm install -g npm@latest) || exit 0

# test npm works properly
RUN node --version && npm --version

WORKDIR /app
