#!/usr/bin/env bash
echo "Hello I am checnking ${NODE_VERSION} version"

if [ "${NODE_VERSION}" = "6.0.0" ]; then
  echo "Fixing Docker image ${NODE_VERSION}"
  cd $(npm root -g)/npm
  npm install fs-extra
  sed -i -e s/graceful-fs/fs-extra/ -e s/fs\.rename/fs.move/ ./lib/utils/rename.js
fi

if [ "${NODE_VERSION:0:4}" = "8.1." -o "${NODE_VERSION:0:5}" = "6.17." ]; then
  echo "Fixing Docker image ${NODE_VERSION}"
  npm install -g strip-ansi \
    inherits \
    has-unicode \
    nopt \
    umask \
    once \
    mkdirp \
    uid-number \
    inflight \
    slide \
    imurmurhash \
    validate-npm-package-name
fi
