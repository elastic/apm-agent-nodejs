/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const semver = require('semver');

const { getDBDestination } = require('../context');

// Match expected `<hostname>:<port>`, e.g. "mongo:27017", "::1:27017",
// "127.0.0.1:27017".
const HOSTNAME_PORT_RE = /^(.+):(\d+)$/;

module.exports = (mongodb, agent, { version, enabled }) => {
  if (!enabled) return mongodb;
  if (!semver.satisfies(version, '>=3.3 <6.0')) {
    agent.logger.debug(
      'mongodb version %s not instrumented (mongodb <3.3 is instrumented via mongodb-core)',
      version,
    );
    return mongodb;
  }

  const ins = agent._instrumentation;

  const activeSpans = new Map();
  if (mongodb.instrument) {
    const listener = mongodb.instrument();
    listener.on('started', onStart);
    listener.on('succeeded', onEnd);
    listener.on('failed', onEnd);
  } else if (mongodb.MongoClient) {
    // mongodb 4.0+ removed the instrument() method in favor of
    // listeners on the instantiated client objects. There are two mechanisms
    // to get a client:
    // 1. const client = new mongodb.MongoClient(...)
    // 2. const client = await MongoClient.connect(...)
    class MongoClientTraced extends mongodb.MongoClient {
      constructor() {
        // The `command*` events are only emitted if `options.monitorCommands: true`.
        const args = Array.prototype.slice.call(arguments);
        if (!args[1]) {
          args[1] = { monitorCommands: true };
        } else if (args[1].monitorCommands !== true) {
          args[1] = Object.assign({}, args[1], { monitorCommands: true });
        }
        super(...args);
        this.on('commandStarted', onStart);
        this.on('commandSucceeded', onEnd);
        this.on('commandFailed', onEnd);
      }
    }
    Object.defineProperty(mongodb, 'MongoClient', {
      enumerable: true,
      get: function () {
        return MongoClientTraced;
      },
    });
  } else {
    agent.logger.warn('could not instrument mongodb@%s', version);
  }
  return mongodb;

  function onStart(event) {
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
      event.commandName,
    ].join('.');

    const span = ins.createSpan(name, 'db', 'mongodb', event.commandName, {
      exitSpan: true,
    });
    if (span) {
      activeSpans.set(event.requestId, span);

      // Destination context.
      // Per the following code it looks like "<hostname>:<port>" should be
      // available via the `address` or `connectionId` field.
      // https://github.com/mongodb/node-mongodb-native/blob/dd356f0ede/lib/core/connection/apm.js#L155-L169
      const address = event.address || event.connectionId;
      let match;
      if (
        address &&
        typeof address === 'string' &&
        (match = HOSTNAME_PORT_RE.exec(address))
      ) {
        span._setDestinationContext(getDBDestination(match[1], match[2]));
      } else {
        agent.logger.trace(
          'could not set destination context on mongodb span from address=%j',
          address,
        );
      }

      const dbContext = { type: 'mongodb', instance: event.databaseName };
      span.setDbContext(dbContext);
    }
  }

  function onEnd(event) {
    if (!activeSpans.has(event.requestId)) return;
    const span = activeSpans.get(event.requestId);
    activeSpans.delete(event.requestId);
    span.end(span._timer.start / 1000 + event.duration);
  }

  function collectionFor(event) {
    const collection = event.command[event.commandName];
    return typeof collection === 'string' ? collection : '$cmd';
  }
};
