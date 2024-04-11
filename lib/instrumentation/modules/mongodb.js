/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const semver = require('semver');

const { OUTCOME_SUCCESS, OUTCOME_FAILURE } = require('../../constants');
const { getDBDestination } = require('../context');
const shimmer = require('../shimmer');
const kListenersAdded = Symbol('kListenersAdded');

// Match expected `<hostname>:<port>`, e.g. "mongo:27017", "::1:27017",
// "127.0.0.1:27017".
const HOSTNAME_PORT_RE = /^(.+):(\d+)$/;

module.exports = (mongodb, agent, { version, enabled }) => {
  if (!enabled) return mongodb;
  if (!semver.satisfies(version, '>=3.3 <7')) {
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
    listener.on('succeeded', onSuccess);
    listener.on('failed', onFailure);
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
        this.on('commandSucceeded', onSuccess);
        this.on('commandFailed', onFailure);
        this[kListenersAdded] = true;
      }
    }
    Object.defineProperty(mongodb, 'MongoClient', {
      enumerable: true,
      get: function () {
        return MongoClientTraced;
      },
    });

    shimmer.wrap(mongodb.MongoClient, 'connect', wrapConnect);
  } else {
    agent.logger.warn('could not instrument mongodb@%s', version);
  }
  return mongodb;

  // Wrap the MongoClient.connect(url, options?, callback?) static method.
  // It calls back with `function (err, client)` or returns a Promise that
  // resolves to the client.
  // https://github.com/mongodb/node-mongodb-native/blob/v4.2.1/src/mongo_client.ts#L503-L511
  //
  // From versions >=4.11.0 the method uses `new this` to create the client instance. Hence
  // our `MongoClientTraced`'s constructor is used and the command listeners are already
  // registered. We should check if the client has already added the listeners to avoid handling
  // the same events twice
  // NOTE: prefering to use a Symbol over version check since internal implementation may
  // change in future versions
  // https://github.com/mongodb/node-mongodb-native/blob/v4.11.0/src/mongo_client.ts#L618
  function wrapConnect(origConnect) {
    return function wrappedConnect(url, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      options = options || {};
      if (!options.monitorCommands) {
        options.monitorCommands = true;
      }
      if (typeof callback === 'function') {
        return origConnect.call(
          this,
          url,
          options,
          function wrappedCallback(err, client) {
            if (err) {
              callback(err);
            } else {
              if (!client[kListenersAdded]) {
                client.on('commandStarted', onStart);
                client.on('commandSucceeded', onSuccess);
                client.on('commandFailed', onFailure);
                client[kListenersAdded] = true;
              }
              callback(err, client);
            }
          },
        );
      } else {
        const p = origConnect.call(this, url, options, callback);
        p.then((client) => {
          if (!client[kListenersAdded]) {
            client.on('commandStarted', onStart);
            client.on('commandSucceeded', onSuccess);
            client.on('commandFailed', onFailure);
            client[kListenersAdded] = true;
          }
        });
        return p;
      }
    };
  }

  function onStart(event) {
    // `event` is a `CommandStartedEvent`
    // https://github.com/mongodb/specifications/blob/master/source/command-logging-and-monitoring/command-logging-and-monitoring.rst#command-started-message
    // E.g. with mongodb@6.2.0:
    //   CommandStartedEvent {
    //     connectionId: '127.0.0.1:27017',
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

  function onSuccess(event) {
    // `event` is a `CommandSucceededEvent`
    // https://github.com/mongodb/specifications/blob/master/source/command-logging-and-monitoring/command-logging-and-monitoring.rst#command-succeeded-message
    // E.g. with mongodb@6.2.0:
    //   CommandSucceededEvent {
    //     connectionId: '127.0.0.1:27017',
    //     requestId: 1,
    //     duration: 1,
    //     reply: { ... }
    //   }
    if (!activeSpans.has(event.requestId)) return;

    const span = activeSpans.get(event.requestId);
    activeSpans.delete(event.requestId);

    // From mongodb@3.6.0 and up some commands like `deleteOne` may contain
    // error data inside the `reply` property. It makes sense to capture it.
    const writeErrors = event?.reply?.writeErrors;

    if (writeErrors && writeErrors.length) {
      agent.captureError(writeErrors[0].errmsg, {
        skipOutcome: true,
        parent: span,
      });
    }
    span.setOutcome(OUTCOME_SUCCESS);
    span.end(span._timer.start / 1000 + event.duration);
  }

  function onFailure(event) {
    // `event` is a `CommandFailedEvent`
    // https://github.com/mongodb/specifications/blob/master/source/command-logging-and-monitoring/command-logging-and-monitoring.rst#command-failed-message
    // E.g. with mongodb@6.2.0:
    // CommandFailedEvent {
    //   connectionId: '127.0.0.1:27017',
    //   requestId: 6,
    //   commandName: "find",
    //   duration: 1,
    //   "failure": { ... }
    // }
    if (!activeSpans.has(event.requestId)) return;

    const span = activeSpans.get(event.requestId);
    activeSpans.delete(event.requestId);
    span.setOutcome(OUTCOME_FAILURE);
    span.end(span._timer.start / 1000 + event.duration);
  }

  function collectionFor(event) {
    // `getMore` command is a special case where the collection name is
    // placed in a property named `collection`. The types exported
    // do not ensure the property is there so we are defensive on its
    // retrieval.
    //
    // Example of `getMore` payload:
    // {
    //   event: CommandStartedEvent {
    //     name: 'commandStarted',
    //     address: '172.20.0.2:27017',
    //     connectionId: 12,
    //     requestId: 686,
    //     databaseName: 'mydatabase',
    //     commandName: 'getMore',
    //     command: {
    //       getMore: new Long('1769182660590360229'),
    //       collection: 'Interaction',
    //       ...
    //     }
    //   },
    //   commandName: 'getMore',
    //   collection: new Long('1769182660590360229')
    // }
    // ref: https://github.com/elastic/apm-agent-nodejs/issues/3834
    if (
      event.commandName === 'getMore' &&
      typeof event.command.collection === 'string'
    ) {
      return event.command.collection;
    }

    const collection = event.command[event.commandName];
    return typeof collection === 'string' ? collection : '$cmd';
  }
};
