/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
const semver = require('semver')
const shimmer = require('../../shimmer')
const elasticAPMMiddlewares = Symbol('elasticAPMMiddlewares')
const { createMiddlewaresForS3Client } = require('./client-s3')

const middlewareFactories = {
  S3Client: createMiddlewaresForS3Client
}

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) return mod

  // We have to do this check since npm view reveals RC versions below 3
  if (!semver.satisfies(version, '>=3 <4')) {
    agent.logger.debug('cannot instrument @aws-sdk/client-*: @aws-sdk/smithy-client version %s not supported', version)
    return mod
  }

  shimmer.wrap(mod.Client.prototype, 'send', function (orig) {
    return function _wrappedSmithyClientSend () {
      if (!this[elasticAPMMiddlewares]) {
        const clientName = this.constructor && this.constructor.name
        const factory = middlewareFactories[clientName]
        const middlewares = typeof factory === 'function' ? factory(this, agent) : []

        // We do the instrumentation by leveraging the middleware mechanism provided by the
        // middlewareStack property of the Client instance. We add the instrumentation middlewares
        // once at the client level so they persist for the whole life of the client instance
        // https://github.com/aws/aws-sdk-js-v3/tree/main/packages/middleware-stack
        this[elasticAPMMiddlewares] = middlewares
        for (const item of this[elasticAPMMiddlewares]) {
          this.middlewareStack.add(item.middleware, item.options)
        }
      }

      return orig.apply(this, arguments)
    }
  })
  return mod
}
