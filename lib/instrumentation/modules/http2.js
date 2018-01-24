'use strict'

var eos = require('end-of-stream')
var shimmer = require('../shimmer')
var symbols = require('../../symbols')

module.exports = function (http2, agent) {
  agent.logger.debug('shimming http2.createServer function')
  shimmer.wrap(http2, 'createServer', wrapCreateServer)
  shimmer.wrap(http2, 'createSecureServer', wrapCreateServer)

  return http2

  // The `createServer` function will unpatch itself after patching
  // the first server prototype it patches.
  function wrapCreateServer (original) {
    return function wrappedCreateServer (options, handler) {
      var server = original.apply(this, arguments)
      shimmer.wrap(server.constructor.prototype, 'emit', wrapEmit)
      wrappedCreateServer[symbols.unwrap]()
      return server
    }
  }

  function wrapEmit (original) {
    var patched = false
    return function wrappedEmit (event, stream, headers) {
      if (event === 'stream') {
        if (!patched) {
          patched = true
          shimmer.wrap(stream.constructor.prototype, 'respondWithFile', wrapRespondWith)
          shimmer.wrap(stream.constructor.prototype, 'respondWithFD', wrapRespondWith)
          shimmer.wrap(stream.constructor.prototype, 'respond', wrapHeaders)
          shimmer.wrap(stream.constructor.prototype, 'end', wrapEnd)
        }

        agent.logger.debug('intercepted request event call to http2.Server.prototype.emit')

        var trans = agent.startTransaction()
        trans.type = 'request'
        trans.req = {
          headers,
          socket: stream.session.socket,
          method: headers[':method'],
          url: headers[':path'],
          httpVersion: '2.0'
        }
        trans.res = {
          statusCode: 200,
          headersSent: false,
          finished: false,
          headers: null
        }

        eos(stream, function () {
          trans.end()
        })
      }

      return original.apply(this, arguments)
    }
  }

  function updateHeaders (headers) {
    var trans = agent._instrumentation.currentTransaction
    if (trans) {
      var status = headers[':status'] || 200
      trans.result = 'HTTP ' + status.toString()[0] + 'xx'
      trans.res.statusCode = status
      trans.res.headers = mergeHeaders(trans.res.headers, headers)
      trans.res.headersSent = true
    }
  }

  function wrapHeaders (original) {
    return function (headers) {
      updateHeaders(headers)
      return original.apply(this, arguments)
    }
  }

  function wrapRespondWith (original) {
    return function (_, headers) {
      updateHeaders(headers)
      return original.apply(this, arguments)
    }
  }

  function wrapEnd (original) {
    return function (headers) {
      var trans = agent._instrumentation.currentTransaction
      if (trans) trans.res.finished = true
      return original.apply(this, arguments)
    }
  }

  function mergeHeaders (source, target) {
    if (source === null) return target
    var result = Object.assign({}, target)
    var keys = Object.keys(source)
    for (let i = 0; i < keys.length; i++) {
      var key = keys[i]
      if (typeof target[key] === 'undefined') {
        result[key] = source[key]
      } else if (Array.isArray(target[key])) {
        result[key].push(source[key])
      } else {
        result[key] = [ source[key] ].concat(target[key])
      }
    }
    return result
  }
}
