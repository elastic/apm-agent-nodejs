/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const shimmer = require('../../../../../../shimmer')
const { getDBDestination } = require('../../../../../../context')

// XXX Note coming change (for Backend Granularity) that changes TYPE from
//    'cache' to 'db' for other Redis instrumenations per spec.
const TYPE = 'db'
const SUBTYPE = 'redis'
const ACTION = 'query'

// From https://redis.io/commands/ this is the set of redis commands that have
// *two* tokens for the full command name.
const IS_COMMAND_PREFIX = new Set([
  'ACL',
  'CLIENT',
  'CLUSTER',
  'COMMAND',
  'CONFIG',
  'FUNCTION', // e.g. FUNCTION LOAD
  'LATENCY',
  'MEMORY',
  'MODULE',
  'OBJECT',
  'PUBSUB',
  'SCRIPT',
  'SLOWLOG',
  'XGROUP',
  'XINFO'
])

/**
 * Return the redis command name from the given `RedisCommandArguments`.
 *
 *    export type RedisCommandArgument = string | Buffer;
 *    export type RedisCommandArguments = Array<RedisCommandArgument> & { preserve?: unknown };
 *
 * Examples:
 *    > commandNameFromArgs(['PING'])
 *    'PING'
 *    > commandNameFromArgs(['SET', 'foo', 'bar'])
 *    'SET'
 *    > commandNameFromArgs(['ACL', 'SETUSER', 'karin', 'on', '+@all', '-@dangerous'])
 *    'ACL SETUSER'
 */
function commandNameFromArgs (args) {
  if (IS_COMMAND_PREFIX.has(args[0]) && args.length >= 2) {
    return args.slice(0, 2).join(' ')
  } else {
    return args[0]
  }
}

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

  const RedisCommandsQueue = mod.default
  if (!(RedisCommandsQueue &&
      RedisCommandsQueue.name === 'RedisCommandsQueue' &&
      RedisCommandsQueue.prototype &&
      typeof RedisCommandsQueue.prototype.addCommand === 'function')) {
    console.log('XXX nope, cannot instrument @redis/client')
    return mod
  }

  const ins = agent._instrumentation

  agent.logger.debug('shimming @redis/client RedisCommandsQueue.prototype.addCommand')
  shimmer.wrap(RedisCommandsQueue.prototype, 'addCommand', function wrap (origAddCommand) {
    return function wrappedAddCommand (args) {
      const commandName = commandNameFromArgs(args)
      agent.logger.debug({ commandName }, 'intercepted call to @redis/client RedisCommandsQueue.prototype.addCommand')
      const span = ins.createSpan(commandName, TYPE, SUBTYPE, ACTION, { exitSpan: true })
      if (!span) {
        return origAddCommand.apply(this, arguments)
      }

      // XXX span.setDbContext(...)

      if (this.__destinationContext) {
        span._setDestinationContext(this.__destinationContext)
      }

      const parentRunContext = ins.currRunContext()
      const spanRunContext = parentRunContext.enterSpan(span)
      const finish = ins.bindFunctionToRunContext(spanRunContext, err => {
        if (err) {
          agent.captureError(err)
        }
        span.end()
      })

      // XXX What to do if origAddCommand does *not* return a promise?
      //     I'm not *too* worried about it. As currently written it will
      //     crash the user app. We could guard for that and ... just end the
      //     span now? Those spans will be bogus (sync, zero-ish elapsed time).
      const promise = origAddCommand.apply(this, arguments)
      promise.then(
        function onResolve (_result) {
          finish(null)
        },
        function onReject (err) {
          finish(err)
        }
      )
      return promise
    }
  })

  class RedisCommandsQueueTraced extends RedisCommandsQueue {
    constructor () {
      super(arguments)

      // Determine destination context to use for Redis spans, using the
      // RedisClient `options` passed down from RedisClient.create instrumentation.
      // XXX This'll change to `context.service.target.*` after https://github.com/elastic/apm-agent-nodejs/pull/2882 is done
      if (ins.__redisClientOptions) {
        // https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
        // Reproducing determination of 'address' and 'port' per
        // `RedisClient.#initializeOptions()`
        let address = 'localhost'
        let port = 6379
        if (ins.__redisClientOptions.url) {
          const parsed = new URL(ins.__redisClientOptions.url)
          address = parsed.hostname
          if (parsed.port) {
            port = parsed.port
          }
        }
        if (ins.__redisClientOptions.socket) {
          if (ins.__redisClientOptions.socket.host) {
            address = ins.__redisClientOptions.socket.host
          }
          if (ins.__redisClientOptions.socket.port && !isNaN(Number(ins.__redisClientOptions.socket.port))) {
            port = Number(ins.__redisClientOptions.socket.port)
          }
        }

        // XXX use a symbol for this field

        this.__destinationContext = getDBDestination(address, port)
      }
    }

    // XXX TODO: moved the addCommand here and use super().addCommand(arguments) etc., rather than shimming
  }
  mod.default = RedisCommandsQueueTraced

  return mod
}
