'use strict'

var semver = require('semver')

const constants = require('../../constants')
var shimmer = require('../shimmer')

const isWrappedRedisCbSym = Symbol('ElasticAPMIsWrappedRedisCb')

const TYPE = 'cache'
const SUBTYPE = 'redis'

module.exports = function (redis, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>=2.0.0 <4.0.0')) {
    agent.logger.debug('redis version %s not supported - aborting...', version)
    return redis
  }

  const ins = agent._instrumentation

  // The undocumented field on a RedisClient instance on which connection
  // options are stored has changed a few times.
  //
  // - >=2.4.0: `client.connection_options.{host,port}`, commit eae5596a
  // - >=2.3.0, <2.4.0: `client.connection_option.{host,port}`, commit d454e402
  // - >=0.12.0, <2.3.0: `client.connectionOption.{host,port}`, commit 064260d1
  // - <0.12.0: *maybe* `client.{host,port}`
  const connOptsFromRedisClient = (rc) => rc.connection_options ||
    rc.connection_option || rc.connectionOption || {}

  var proto = redis.RedisClient && redis.RedisClient.prototype
  if (semver.satisfies(version, '>2.5.3')) {
    agent.logger.debug('shimming redis.RedisClient.prototype.internal_send_command')
    shimmer.wrap(proto, 'internal_send_command', wrapInternalSendCommand)
  } else {
    agent.logger.debug('shimming redis.RedisClient.prototype.send_command')
    shimmer.wrap(proto, 'send_command', wrapSendCommand)
  }

  return redis

  function makeWrappedCallback (span, origCb) {
    const wrappedCallback = ins.bindFunction(function (err, _reply) {
      if (err) {
        span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
        agent.captureError(err, { skipOutcome: true })
      }
      span.end()
      if (origCb) {
        return origCb.apply(this, arguments)
      }
    })
    wrappedCallback[isWrappedRedisCbSym] = true
    return wrappedCallback
  }

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      if (!commandObj || typeof commandObj.command !== 'string') {
        // Unexpected usage. Skip instrumenting this call.
        return original.apply(this, arguments)
      }

      if (commandObj.callback && commandObj.callback[isWrappedRedisCbSym]) {
        // Avoid re-wrapping internal_send_command called *again* for commands
        // queued before the client was "ready".
        return original.apply(this, arguments)
      }

      const command = commandObj.command
      agent.logger.debug({ command: command }, 'intercepted call to RedisClient.prototype.internal_send_command')
      const span = enabled && ins.createSpan(command.toUpperCase(), TYPE, SUBTYPE, { exitSpan: true })
      if (!span) {
        return original.apply(this, arguments)
      }

      const connOpts = connOptsFromRedisClient(this)
      span._setDestinationAddress(connOpts.host, connOpts.port)

      commandObj.callback = makeWrappedCallback(span, commandObj.callback)
      const spanRunContext = ins.currRunContext().enterSpan(span)
      return ins.withRunContext(spanRunContext, original, this, ...arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command, args, cb) {
      if (typeof command !== 'string') {
        // Unexpected usage. Skip instrumenting this call.
        return original.apply(this, arguments)
      }

      let origCb = cb
      if (!origCb && Array.isArray(args) && typeof args[args.length - 1] === 'function') {
        origCb = args[args.length - 1]
      }
      if (origCb && origCb[isWrappedRedisCbSym]) {
        // Avoid re-wrapping send_command called *again* for commands queued
        // before the client was "ready".
        return original.apply(this, arguments)
      }

      agent.logger.debug({ command: command }, 'intercepted call to RedisClient.prototype.send_command')
      var span = enabled && ins.createSpan(command.toUpperCase(), TYPE, SUBTYPE, { exitSpan: true })
      if (!span) {
        return original.apply(this, arguments)
      }

      const connOpts = connOptsFromRedisClient(this)
      span._setDestinationAddress(connOpts.host, connOpts.port)

      const wrappedCb = makeWrappedCallback(span, origCb)
      if (cb) {
        cb = wrappedCb
      } else if (origCb) {
        args[args.length - 1] = wrappedCb
      } else {
        cb = wrappedCb
      }
      const spanRunContext = ins.currRunContext().enterSpan(span)
      return ins.withRunContext(spanRunContext, original, this, command, args, cb)
    }
  }
}
