'use strict'

const semver = require('semver')
const { getDBDestination } = require('../context')

module.exports = (mongodb, agent, { version, enabled }) => {
  if (!enabled) return mongodb
  if (!semver.satisfies(version, '>=3.3')) {
    agent.logger.debug('mongodb version %s not supported - aborting...', version)
    return mongodb
  }

  const listener = mongodb.instrument()
  const activeSpans = new Map()

  listener.on('started', onStart)
  listener.on('succeeded', onEnd)
  listener.on('failed', onEnd)

  return mongodb

  function onStart (event) {
    const name = [
      event.databaseName,
      collectionFor(event),
      event.commandName
    ].join('.')

    const span = agent.startSpan(name, 'db', 'mongodb', 'query')
    if (span) {
      activeSpans.set(event.requestId, span)

      console.log('XXX event', event);

      // XXX
      // This event looks like this with mongodb@3.6.3:
      //   CommandStartedEvent {
      //     address: '127.0.0.1:27017',
      //     connectionId: 1,
      //     requestId: 1,
      //     databaseName: 'test',
      //     commandName: 'insert',
      //     command:
      //     { insert: 'cats',
      //       documents: [ [Object] ],
      //       ordered: true,
      //       lsid: { id: [Binary] },
      //       '$db': 'test' } }
      // However, I'm not sure how reliable the presence of that `address`
      // field is. It is here in the current code:
      //    https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/core/connection/apm.js#L166
      // but is only indirectly in a test, and not listed in this "spec":
      //    https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst#api
      // It looks to me, from that apm.js file, like in some versions or
      // configurations this "<hostname>:<port>" will be the `connectionId` field.
      // TODO: grok when that is the case
      const address = event.address || event.connectionId
      if (address && typeof(address) === 'string') {
        // XXX Is this reliably "<hostname>:<port>"?
        const { hostname, port } = address.split(/:/);
        span.setDestinationContext(
          getDBDestination(span, hostname, port))
      }
      // XXX else log can't get it?
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
