'use strict'

// Instrumentation of the 'ioredis' package:
// https://github.com/luin/ioredis
// https://github.com/luin/ioredis/blob/master/API.md

const semver = require('semver')

const constants = require('../../constants')
const { getDBDestination } = require('../context')
const shimmer = require('../shimmer')

const TYPE = 'cache'
const SUBTYPE = 'redis'

module.exports = function (ioredis, agent, { version, enabled }) {
  if (!enabled) {
    return ioredis
  }
  if (!semver.satisfies(version, '>=2.0.0 <5.0.0')) {
    agent.logger.debug('ioredis version %s not supported - aborting...', version)
    return ioredis
  }

  const ins = agent._instrumentation

  agent.logger.debug('shimming ioredis.prototype.sendCommand')
  shimmer.wrap(ioredis.prototype, 'sendCommand', wrapSendCommand)
  return ioredis

  function wrapSendCommand (origSendCommand) {
    return function wrappedSendCommand (command) {
      if (!command || !command.name || !command.promise) {
        // Doesn't look like an ioredis.Command, skip instrumenting.
        return origSendCommand.apply(this, arguments)
      }

      agent.logger.debug({ command: command.name }, 'intercepted call to ioredis.prototype.sendCommand')
      const span = ins.createSpan(command.name.toUpperCase(), TYPE, SUBTYPE)
      if (!span) {
        return origSendCommand.apply(this, arguments)
      }

      const options = this.options || {} // `this` is the `Redis` client.
      span.setDestinationContext(getDBDestination(span, options.host, options.port))

      command.promise.then(
        () => {
          span.end()
        },
        (err) => {
          span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
          agent.captureError(err, { skipOutcome: true })
          span.end()
        }
      )
      const spanRunContext = ins.currRunContext().enterSpan(span)
      return ins.withRunContext(spanRunContext, origSendCommand, this, ...arguments)
    }
  }
}
