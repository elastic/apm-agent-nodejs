'use strict'

var eos = require('end-of-stream')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')
var { parseUrl } = require('../../parsers')
var { getHTTPDestination } = require('../context')

module.exports = function (http2, agent, { enabled }) {
  if (agent._conf.instrumentIncomingHTTPRequests) {
    agent.logger.debug('shimming http2.createServer function')
    shimmer.wrap(http2, 'createServer', wrapCreateServer)
    shimmer.wrap(http2, 'createSecureServer', wrapCreateServer)
  }

  if (!enabled) return http2
  var ins = agent._instrumentation
  agent.logger.debug('shimming http2.connect function')
  shimmer.wrap(http2, 'connect', wrapConnect)

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
          var proto = stream.constructor.prototype
          shimmer.wrap(proto, 'pushStream', wrapPushStream)
          shimmer.wrap(proto, 'respondWithFile', wrapRespondWith)
          shimmer.wrap(proto, 'respondWithFD', wrapRespondWith)
          shimmer.wrap(proto, 'respond', wrapHeaders)
          shimmer.wrap(proto, 'end', wrapEnd)
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
        ins.bindEmitter(stream)

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
      trans._setOutcomeFromHttpStatusCode(status)
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

  function wrapPushStream (original) {
    return function wrappedPushStream (...args) {
      var callback = args.pop()
      args.push(function wrappedPushStreamCallback () {
        // NOTE: Break context so push streams don't overwrite outer transaction state.
        var trans = agent._instrumentation.currentTransaction
        agent._instrumentation.currentTransaction = null
        var ret = callback.apply(this, arguments)
        agent._instrumentation.currentTransaction = trans
        return ret
      })
      return original.apply(this, args)
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
        result[key] = [source[key]].concat(target[key])
      }
    }
    return result
  }

  function wrapConnect (orig) {
    return function (host) {
      const ret = orig.apply(this, arguments)
      shimmer.wrap(ret, 'request', orig => wrapRequest(orig, host))
      return ret
    }
  }

  function wrapRequest (orig, host) {
    return function (headers) {
      var span = agent.startSpan(null, 'external', 'http2')
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to http2.request %o', { id })

      var req = orig.apply(this, arguments)
      if (!span) return req

      ins.bindEmitter(req)

      var urlObj = parseUrl(headers[':path'])
      var method = headers[':method'] || 'GET'
      var path = urlObj.pathname
      var url = host + path
      span.name = method + ' ' + url

      var statusCode
      req.on('response', (headers) => {
        statusCode = headers[':status']
      })

      req.on('end', () => {
        agent.logger.debug('intercepted http2 client end event %o', { id })

        span.setHttpContext({
          method,
          status_code: statusCode,
          url
        })
        span._setOutcomeFromHttpStatusCode(statusCode)

        // The `getHTTPDestination` function might throw in case an
        // invalid URL is given to the `URL()` function. Until we can
        // be 100% sure this doesn't happen, we better catch it here.
        // For details, see:
        // https://github.com/elastic/apm-agent-nodejs/issues/1769
        try {
          span.setDestinationContext(getHTTPDestination(url, span.type))
        } catch (e) {
          agent.logger.error('Could not set destination context: %s', e.message)
        }

        span.end()
      })

      return req
    }
  }
}
