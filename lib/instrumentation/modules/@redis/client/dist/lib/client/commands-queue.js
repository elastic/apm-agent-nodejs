/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const semver = require('semver');
const { getDBDestination } = require('../../../../../../context');
const { redisClientOptions } = require('../../../../../../../../lib/symbols');
const destinationContext = Symbol('destinationContext');

const TYPE = 'db';
const SUBTYPE = 'redis';
const ACTION = 'query';

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
  'XINFO',
]);

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
function commandNameFromArgs(args) {
  if (IS_COMMAND_PREFIX.has(args[0]) && args.length >= 2) {
    return args.slice(0, 2).join(' ');
  } else {
    return args[0];
  }
}

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

  const RedisCommandsQueue = mod.default;
  if (
    !(
      RedisCommandsQueue &&
      RedisCommandsQueue.name === 'RedisCommandsQueue' &&
      RedisCommandsQueue.prototype &&
      typeof RedisCommandsQueue.prototype.addCommand === 'function'
    )
  ) {
    agent.logger.debug('cannot instrument @redis/client');
    return mod;
  }

  const ins = agent._instrumentation;

  agent.logger.debug(
    'shimming @redis/client RedisCommandsQueue.prototype.addCommand',
  );

  class RedisCommandsQueueTraced extends RedisCommandsQueue {
    constructor() {
      super(arguments);

      // Determine destination context to use for Redis spans, using the
      // RedisClient `options` passed down from RedisClient.create instrumentation.
      if (ins[redisClientOptions]) {
        // https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
        // Reproducing determination of 'address' and 'port' per
        // `RedisClient.#initializeOptions()`
        let address = 'localhost';
        let port = 6379;
        if (ins[redisClientOptions].url) {
          const parsed = new URL(ins[redisClientOptions].url);
          address = parsed.hostname;
          if (parsed.port) {
            port = parsed.port;
          }
        }
        if (ins[redisClientOptions].socket) {
          if (ins[redisClientOptions].socket.host) {
            address = ins[redisClientOptions].socket.host;
          }
          if (
            ins[redisClientOptions].socket.port &&
            !isNaN(Number(ins[redisClientOptions].socket.port))
          ) {
            port = Number(ins[redisClientOptions].socket.port);
          }
        }

        this[destinationContext] = getDBDestination(address, port);
      }
    }

    addCommand(args) {
      const commandName = commandNameFromArgs(args);
      agent.logger.debug(
        { commandName },
        'intercepted call to @redis/client RedisCommandsQueue.prototype.addCommand',
      );
      const span = ins.createSpan(
        commandName.toUpperCase(),
        TYPE,
        SUBTYPE,
        ACTION,
        { exitSpan: true },
      );
      if (!span) {
        return super.addCommand.apply(this, arguments);
      }

      span.setDbContext({ type: 'redis' });

      if (this[destinationContext]) {
        span._setDestinationContext(this[destinationContext]);
      }

      const parentRunContext = ins.currRunContext();
      const spanRunContext = parentRunContext.enterSpan(span);
      const finish = ins.bindFunctionToRunContext(spanRunContext, (err) => {
        if (err) {
          agent.captureError(err);
        }
        span.end();
      });

      const promise = super.addCommand.apply(this, arguments);
      if (promise.then) {
        promise.then(
          function onResolve(_result) {
            finish(null);
          },
          function onReject(err) {
            finish(err);
          },
        );
      } else {
        // didn't get back the expected promose -- just end the
        // span now and accept that those spans will be bogus
        // (sync, zero-ish elapsed time).
        span.end();
      }
      return promise;
    }
  }
  mod.default = RedisCommandsQueueTraced;

  return mod;
};
