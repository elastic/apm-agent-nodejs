'use strict'

const semver = require('semver')

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
