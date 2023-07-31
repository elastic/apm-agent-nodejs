/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Shim @redis/client's `RedisClient.create` to pass client options down to
// the `RedisCommandsQueue` instrumentation in ./client/commands-queue.js.
const semver = require('semver');
const shimmer = require('../../../../../shimmer');
const { redisClientOptions } = require('../../../../../../../lib/symbols');

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod;
  }
  if (!semver.satisfies(version, '>=1 <2')) {
    agent.logger.debug(
      '@redis/client/dist/lib/client version %s not supported - aborting...',
      version,
    );
    return mod;
  }

  const RedisClient = mod.default;
  if (!(RedisClient && typeof RedisClient.create === 'function')) {
    agent.logger.debug('cannot instrument @redis/client RedisClient');
    return mod;
  }

  const ins = agent._instrumentation;

  agent.logger.debug('shimming @redis/client RedisClient.create');
  shimmer.wrap(RedisClient, 'create', function wrap(origCreate) {
    return function wrappedCreate(options) {
      // Capture the RedisClient options for just the synchronous run of the
      // create function. We are relying on the RedisClient constructor
      // synchronously creating its RedisCommandsQueue, which we've wrapped
      // to pick up these options. This allows the queue instance to determine
      // the appropriate destination context for spans it creates.
      ins[redisClientOptions] = options;
      const rv = origCreate.apply(this, arguments);
      delete ins[redisClientOptions];
      return rv;
    };
  });

  return mod;
};
