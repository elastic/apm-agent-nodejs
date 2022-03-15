FROM ubuntu:20.04

# - nvm dependencies: build-essential, libssl-dev, curl
# - git is installed for usage in tests using this image
RUN apt-get -qq update \
  && apt-get -qq install -y build-essential \
  && apt-get -qq install -y libssl-dev \
  && apt-get -qq install -y curl \
  && apt-get -qq install -y git \
  && apt-get -qq clean \
  && rm -fr /var/lib/apt/lists/*

# Environment variables to set what version to be installed
ARG NODE_VERSION
ARG NODE_FULL_VERSION
ARG NVM_NODEJS_ORG_MIRROR
ARG ELASTIC_APM_ASYNC_HOOKS
ENV NODE_VERSION=${NODE_VERSION}
ENV NODE_FULL_VERSION=${NODE_FULL_VERSION}
ENV NVM_NODEJS_ORG_MIRROR=${NVM_NODEJS_ORG_MIRROR}
ENV ELASTIC_APM_ASYNC_HOOKS=${ELASTIC_APM_ASYNC_HOOKS}

# nvm environment variables
ENV NVM_VERSION v0.34.0
ENV NVM_DIR /usr/local/nvm
RUN mkdir $NVM_DIR
RUN curl --silent -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash

ENV NODE_PATH $NVM_DIR/versions/node/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Install node
RUN echo "source $NVM_DIR/nvm.sh && \
    nvm install $NODE_FULL_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use default" | bash

# Create symlinks
RUN echo "source $NVM_DIR/nvm.sh && \
    nvm version > /tmp/version" | bash
RUN ln -fs $NVM_DIR/$(cat /tmp/version) $NVM_DIR/v$NODE_VERSION && \
    ln -fs $NVM_DIR/versions/node/$(cat /tmp/version) $NVM_DIR/versions/node/v$NODE_VERSION

# test npm works properly
RUN node --version && npm --version

# Set the PATH again
ENV PATH /app/node_modules/.bin:./node_modules/.bin:/app/node_modules:$PATH

WORKDIR /app
