ARG NODE_VERSION=8
FROM node:${NODE_VERSION}

RUN id && npm install -g yarn && yarn global upgrade npm@latest
RUN node --version && npm --version

WORKDIR /app
