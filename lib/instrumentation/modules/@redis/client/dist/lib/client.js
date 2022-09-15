/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Shim @redis/client's `RedisClient.create` to pass client options down to
// the `RedisCommandsQueue` instrumentation in ./client/commands-queue.js.

const shimmer = require('../../../../../shimmer')

module.exports = function (mod, agent, { version, enabled }) {
  // XXX Might *prefer* to have the disableInstrumentations key for this be
  //    "redis" rather than "@redis/client/...". This would need some structural
  //    changes in instr/index.js for this (a richer `MODULES`), but is likely
  //    better for a separate issue/PR.
  console.log('XXX enabled: ', enabled)
  // XXX This is the `@redis/client` version (currently "1.3.0").
  //     I guess we can set this to support 1.x on the assumption for now that
  //     redis@4 doesn't update to a new @redis/client major ver without a
  //     major version bump itself. We then rely on TAV tests to tell us of
  //     breakage.
  console.log('XXX version: ', version)

  const RedisClient = mod.default
  if (!(RedisClient && typeof RedisClient.create === 'function')) {
    console.log('XXX nope, cannot instrument @redis/client RedisClient')
    return mod
  }

  const ins = agent._instrumentation

  agent.logger.debug('shimming @redis/client RedisClient.create')
  shimmer.wrap(RedisClient, 'create', function wrap (origCreate) {
    return function wrappedCreate (options) {
      // Capture the RedisClient options for just the synchronous run of the
      // create function. We are relying on the RedisClient constructor
      // synchronously creating its RedisCommandsQueue, which we've wrapped
      // to pick up these options. This allows the queue instance to determine
      // the appropriate destination context for spans it creates.
      ins.__redisClientOptions = options // XXX use a symbol for this field
      const rv = origCreate.apply(this, arguments)
      delete ins.__redisClientOptions
      return rv
    }
  })

  return mod
}