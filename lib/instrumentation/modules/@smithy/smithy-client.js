/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const semver = require('semver');
const shimmer = require('../../shimmer');
const elasticAPMMiddlewares = Symbol('elasticAPMMiddlewares');
const {
  S3_NAME,
  S3_TYPE,
  S3_SUBTYPE,
  s3MiddlewareFactory,
} = require('../@aws-sdk/client-s3');

/**
 * We do alias them to a local type
 * @typedef {import('@aws-sdk/types').InitializeMiddleware} InitializeMiddleware
 * @typedef {import('@aws-sdk/types').FinalizeRequestMiddleware } FinalizeRequestMiddleware
 * @typedef {import('@aws-sdk/types').InitializeHandlerOptions} InitializeHandlerOptions
 * @typedef {import('@aws-sdk/types').FinalizeRequestHandlerOptions } FinalizeRequestHandlerOptions
 *
 * Then create our types
 * @typedef {InitializeMiddleware | FinalizeRequestMiddleware} AWSMiddleware
 * @typedef {InitializeHandlerOptions | FinalizeRequestHandlerOptions} AWSMiddlewareOptions

 * @typedef {object} AWSMiddlewareEntry
 * @property {AWSMiddleware} middleware
 * @property {AWSMiddlewareOptions} options
 */

const COMMAND_NAME_RE = /^(\w+)Command$/;
/**
 * TODO: this method may be shared with other instrumentations
 * For a HeadObject API call, `context.commandName === 'HeadObjectCommand'`.
 *
 * @param {String} commandName
 * @returns {String}
 */
function opNameFromCommandName(commandName) {
  const match = COMMAND_NAME_RE.exec(commandName);
  if (match) {
    return match[1];
  } else {
    return '<unknown command>';
  }
}

const clientsConfig = {
  S3Client: {
    NAME: S3_NAME,
    TYPE: S3_TYPE,
    SUBTYPE: S3_SUBTYPE,
    factory: s3MiddlewareFactory,
  },
};

module.exports = function (mod, agent, { name, version, enabled }) {
  if (!enabled) return mod;

  // As of `@aws-sdk/*@3.363.0` the underlying smithy-client is under the
  // `@smithy/` npm org and is 1.x.
  if (
    name === '@smithy/smithy-client' &&
    !semver.satisfies(version, '>=1 <3')
  ) {
    agent.logger.debug(
      'cannot instrument @aws-sdk/client-*: @smithy/smithy-client version %s not supported',
      version,
    );
    return mod;
  } else if (
    name === '@aws-sdk/smithy-client' &&
    !semver.satisfies(version, '>=3 <4')
  ) {
    agent.logger.debug(
      'cannot instrument @aws-sdk/client-*: @aws-sdk/smithy-client version %s not supported',
      version,
    );
    return mod;
  }

  shimmer.wrap(mod.Client.prototype, 'send', function (orig) {
    return function _wrappedSmithyClientSend() {
      const clientName = this.constructor && this.constructor.name;
      const clientConfig = clientsConfig[clientName];

      if (!clientConfig) {
        return orig.apply(this, arguments);
      }

      if (!this[elasticAPMMiddlewares]) {
        const factory = clientConfig && clientConfig.factory;
        const middlewares =
          typeof factory === 'function' ? factory(this, agent) : [];

        // We do the instrumentation by leveraging the middleware mechanism provided by the
        // middlewareStack property of the Client instance. We add the instrumentation middlewares
        // once at the client level so they persist for the whole life of the client instance
        // https://github.com/aws/aws-sdk-js-v3/tree/main/packages/middleware-stack
        this[elasticAPMMiddlewares] = middlewares;
        for (const item of this[elasticAPMMiddlewares]) {
          this.middlewareStack.add(item.middleware, item.options);
        }
      }

      const command = arguments[0];
      const opName = opNameFromCommandName(command.constructor.name);
      const name = clientConfig.NAME + ' ' + opName;

      const ins = agent._instrumentation;
      const span = ins.createSpan(
        name,
        clientConfig.TYPE,
        clientConfig.SUBTYPE,
        opName,
        { exitSpan: true },
      );

      if (!span) {
        return orig.apply(this, arguments);
      }

      // Run context notes: The `orig` should run in the context of the S3 span,
      // because that is the point. The user's callback `cb` should run outside of
      // the S3 span.
      const parentRunContext = ins.currRunContext();
      const spanRunContext = parentRunContext.enterSpan(span);

      // Although the client consumer may use the Promise API `S3Client.send(command).then(...)`
      // the clients may make use of the callback parameter on the super class method (SmithyClient)
      // therefore we need to have this check
      const cb = arguments[arguments.length - 1];
      if (typeof cb === 'function') {
        arguments[arguments.length - 1] = ins.bindFunctionToRunContext(
          parentRunContext,
          cb,
        );
      }

      return ins.withRunContext(spanRunContext, orig, this, ...arguments);
    };
  });
  return mod;
};
