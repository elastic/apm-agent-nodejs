/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// See "lib/instrumentation/modules/next/README.md".

const semver = require('semver');

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod;
  }
  if (
    !semver.satisfies(version, '>=11.1.0 <13.3.0', { includePrerelease: true })
  ) {
    agent.logger.debug('next version %s not supported, skipping', version);
    return mod;
  }

  // This isn't perfect. Which framework the agent will report with a
  // custom Next.js server using another framework, e.g.
  //   https://github.com/vercel/next.js/blob/canary/examples/custom-server-fastify/server.js
  // depends on which is *imported* first.
  agent.setFramework({ name: 'Next.js', version, overwrite: false });

  return mod;
};
