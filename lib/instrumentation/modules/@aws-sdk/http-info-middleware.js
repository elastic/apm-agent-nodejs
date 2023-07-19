/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const elasticHttpInfo = Symbol('elasticHttpInfo')

/**
 * Gets http information (address, port, ...) and stash it into the context for use in
 * other middlewares
 *
 * @type {import('@aws-sdk/types').FinalizeRequestMiddleware}
 */
function httpInfoMiddleware (next, context) {
  return function (args) {
    const req = args.request
    let port = req.port

    // Resolve port for HTTP(S) protocols
    if (port === undefined) {
      if (req.protocol === 'https:') {
        port = 443
      } else if (req.protocol === 'http:') {
        port = 80
      }
    }

    context[elasticHttpInfo] = {
      address: req.hostname,
      port
    }
    return next(args)
  }
}

/**
 * Extracts stashed HTTP info from the context
 * @param {any} context The context of the request
 * @returns the HTTP info
 */
function getHttpInfo (context) {
  if (context[elasticHttpInfo]) {
    return {
      address: context[elasticHttpInfo].address,
      port: context[elasticHttpInfo].port
    }
  }
  return {}
}

module.exports = {
  elasticHttpInfo,
  httpInfoMiddleware,
  getHttpInfo
}
