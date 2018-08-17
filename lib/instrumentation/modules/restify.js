'use strict'

const isError = require('core-util-is').isError

const shimmer = require('../shimmer')

const httpMethods = [
  'del',
  'get',
  'head',
  'opts',
  'post',
  'put',
  'patch'
]

module.exports = function (restify, agent, version, enabled) {
  if (!enabled) return restify
  if (!agent._conf.frameworkName) agent._conf.frameworkName = 'restify'
  if (!agent._conf.frameworkVersion) agent._conf.frameworkVersion = version

  const reportedSymbol = Symbol('reported')

  function makeWrapHandler (name) {
    return function wrapHandler (handler) {
      return function wrappedHandler (request) {
        agent._instrumentation.setDefaultTransactionName(name)
        shimmer.wrap(arguments, 2, function wrapNext (next) {
          return function wrappedNext (err) {
            if (isError(err) && !err[reportedSymbol]) {
              err[reportedSymbol] = true
              agent.captureError(err, { request })
            }
            return next.apply(this, arguments)
          }
        })
        return handler.apply(this, arguments)
      }
    }
  }

  function patchServer (server) {
    shimmer.massWrap(server, httpMethods, function wrapMethod (fn, method) {
      return function wrappedMethod (path) {
        const name = `${method.toUpperCase()} ${path}`
        const fns = Array.prototype.slice.call(arguments, 1).map(makeWrapHandler(name))
        return fn.apply(this, [path].concat(fns))
      }
    })

    shimmer.massWrap(server, [ 'use', 'pre' ], function wrapMiddleware (fn, method) {
      return function wrappedMiddleware () {
        return fn.apply(this, Array.prototype.slice.call(arguments).map(makeWrapHandler(method)))
      }
    })
  }

  shimmer.wrap(restify, 'createServer', function (fn) {
    return function wrappedCreateServer () {
      const server = fn.apply(this, arguments)
      patchServer(server)
      return server
    }
  })

  return restify
}
