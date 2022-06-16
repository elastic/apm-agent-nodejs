/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const URL = require('url').URL

var shimmer = require('../shimmer')
var { getDBDestination } = require('../context')
const { setElasticsearchDbContext } = require('../elasticsearch-shared')

const startsWithProtocolRE = /^([a-z]+:)?\/\//i
const DEFAULT_PORT = 9200
const DEFAULT_PORT_FROM_PROTO = {
  'http:': 80,
  'https:': 443
}

// This is an imperfect equivalent of the handling in the `Transport`
// constructor and internal `Host` parsing function in the ES client.
function getHostAndPortFromTransportConfig (config) {
  const transportHosts = config ? config.host || config.hosts : null
  if (!transportHosts) {
    return null
  }

  let firstTransportHost = Array.isArray(transportHosts)
    ? transportHosts[0] : transportHosts
  if (!firstTransportHost) {
    return null
  }

  if (typeof firstTransportHost === 'string') {
    // "example.com:42" or "someprotocol://example.com:42" or
    // "someprotocol://example.com".
    if (!startsWithProtocolRE.test(firstTransportHost)) {
      firstTransportHost = 'http://' + firstTransportHost
    }
    let u
    try {
      u = new URL(firstTransportHost)
    } catch (_err) {
      return null
    }
    if (!u.port) {
      u.port = DEFAULT_PORT_FROM_PROTO[u.protocol]
    }
    return [u.hostname, u.port]
  } else if (typeof firstTransportHost === 'object') {
    return [
      firstTransportHost.hostname || firstTransportHost.host,
      firstTransportHost.port || DEFAULT_PORT
    ]
  }

  return null
}

module.exports = function (elasticsearch, agent, { enabled }) {
  if (!enabled) return elasticsearch

  const ins = agent._instrumentation

  agent.logger.debug('shimming elasticsearch.Transport.prototype.request')
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'request', wrapRequest)

  return elasticsearch

  function wrapRequest (original) {
    return function wrappedRequest (params, cb) {
      var span = ins.createSpan(null, 'db', 'elasticsearch', 'request', { exitSpan: true })
      var id = span && span.transaction.id
      var method = params && params.method
      var path = params && params.path

      agent.logger.debug('intercepted call to elasticsearch.Transport.prototype.request %o', { id: id, method: method, path: path })

      if (span && method && path) {
        span.name = `Elasticsearch: ${method} ${path}`

        setElasticsearchDbContext(span, path, params && params.query,
          params && params.body)

        // Get the remote host information from elasticsearch Transport options.
        let host, port
        const hostAndPort = getHostAndPortFromTransportConfig(this._config)
        if (hostAndPort) {
          host = hostAndPort[0]
          port = hostAndPort[1]
        }
        span.setDestinationContext(getDBDestination(span, host, port))

        const parentRunContext = ins.currRunContext()
        const spanRunContext = parentRunContext.enterSpan(span)
        if (typeof cb === 'function') {
          var args = Array.prototype.slice.call(arguments)
          args[1] = function () {
            span.end()
            ins.withRunContext(parentRunContext, cb, this, ...arguments)
          }
          return ins.withRunContext(spanRunContext, original, this, ...args)
        } else {
          const originalPromise = ins.withRunContext(spanRunContext, original, this, ...arguments)

          const descriptors = Object.getOwnPropertyDescriptors(originalPromise)
          delete descriptors.domain

          const inspectedPromise = originalPromise
            .then(function (value) {
              span.end()
              return value
            }, function (err) {
              span.end()
              throw err
            })

          Object.defineProperties(inspectedPromise, descriptors)

          // we have to properly end the span when user aborts the request
          shimmer.wrap(inspectedPromise, 'abort', function wrapAbort (originalAbort) {
            return function wrappedAbort () {
              if (span.ended) return
              agent.logger.debug('intercepted call to elasticsearch.Transport.request.abort %o', { id: id, method: method, path: path })
              const originalReturn = originalAbort.apply(this, args)
              span.end()
              return originalReturn
            }
          })

          return inspectedPromise
        }
      } else {
        agent.logger.debug('could not instrument elasticsearch request %o', { id: id })
        return original.apply(this, arguments)
      }
    }
  }
}
