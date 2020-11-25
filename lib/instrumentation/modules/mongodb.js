'use strict'

const semver = require('semver')
const { getDBDestination } = require('../context')

// Match expected `<hostname>:<port>`.
const HOSTNAME_PORT_RE = /^([^:]+):(\d+)$/

module.exports = (mongodb, agent, { version, enabled }) => {
  if (!enabled) return mongodb
  if (!semver.satisfies(version, '>=3.3')) {
    agent.logger.debug('mongodb version %s not instrumented (mongodb <3.3 is instrumented via mongodb-core)', version)
    return mongodb
  }

  const listener = mongodb.instrument()
  const activeSpans = new Map()

  listener.on('started', onStart)
  listener.on('succeeded', onEnd)
  listener.on('failed', onEnd)

  return mongodb

  function onStart (event) {
    // `event` is a `CommandStartedEvent`
    // https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst#api
    // E.g. with mongodb@3.6.3:
    //   CommandStartedEvent {
    //     address: '127.0.0.1:27017',
    //     connectionId: 1,
    //     requestId: 1,
    //     databaseName: 'test',
    //     commandName: 'insert',
    //     command:
    //     { ... } }

    const name = [
      event.databaseName,
      collectionFor(event),
      event.commandName
    ].join('.')

    const span = agent.startSpan(name, 'db', 'mongodb', 'query')
    if (span) {
      activeSpans.set(event.requestId, span)

      // Per the following code it looks like "<hostname>:<port>" should be
      // available via the `address` or `connectionId` field.
      // https://github.com/mongodb/node-mongodb-native/blob/dd356f0ede/lib/core/connection/apm.js#L155-L169
      const address = event.address || event.connectionId
      let match
      if (address && typeof (address) === 'string' &&
          (match = HOSTNAME_PORT_RE.exec(address))) {
        span.setDestinationContext(
          getDBDestination(span, match[1], match[2]))
      } else {
        agent.logger.trace('could not set destination context on mongodb span from address=%j', address)
      }
    }
  }

  function onEnd (event) {
    if (!activeSpans.has(event.requestId)) return
    const span = activeSpans.get(event.requestId)
    activeSpans.delete(event.requestId)
    span.end((span._timer.start / 1000) + event.duration)
  }

  function collectionFor (event) {
    const collection = event.command[event.commandName]
    return typeof collection === 'string' ? collection : '$cmd'
  }
}
