'use strict'

var url = require('url')

var endOfStream = require('end-of-stream')
var httpRequestToUrl = require('http-request-to-url')

var { parseUrl } = require('../parsers')

const transactionForResponse = new WeakMap()
exports.transactionForResponse = transactionForResponse

exports.instrumentRequest = function (agent, moduleName) {
  var ins = agent._instrumentation
  return function (orig) {
    return function (event, req, res) {
      if (event === 'request') {
        agent.logger.debug('intercepted request event call to %s.Server.prototype.emit for %s', moduleName, req.url)

        if (isRequestBlacklisted(agent, req)) {
          agent.logger.debug('ignoring blacklisted request to %s', req.url)
          // don't leak previous transaction
          agent._instrumentation.currentTransaction = null
        } else {
          var traceparent = req.headers['elastic-apm-traceparent']
          var trans = agent.startTransaction(null, null, {
            childOf: traceparent
          })
          trans.type = 'request'
          trans.req = req
          trans.res = res

          transactionForResponse.set(res, trans)

          ins.bindEmitter(req)
          ins.bindEmitter(res)

          endOfStream(res, function (err) {
            if (trans.ended) return
            if (!err) return trans.end()

            if (agent._conf.errorOnAbortedRequests) {
              var duration = trans._timer.elapsed()
              if (duration > (agent._conf.abortedErrorThreshold * 1000)) {
                agent.captureError('Socket closed with active HTTP request (>' + agent._conf.abortedErrorThreshold + ' sec)', {
                  request: req,
                  extra: { abortTime: duration }
                })
              }
            }

            // Handle case where res.end is called after an error occurred on the
            // stream (e.g. if the underlying socket was prematurely closed)
            const end = res.end
            res.end = function () {
              const result = end.apply(this, arguments)
              trans.end()
              return result
            }
          })
        }
      }

      return orig.apply(this, arguments)
    }
  }
}

function isRequestBlacklisted (agent, req) {
  var i

  for (i = 0; i < agent._conf.ignoreUrlStr.length; i++) {
    if (agent._conf.ignoreUrlStr[i] === req.url) return true
  }
  for (i = 0; i < agent._conf.ignoreUrlRegExp.length; i++) {
    if (agent._conf.ignoreUrlRegExp[i].test(req.url)) return true
  }

  var ua = req.headers['user-agent']
  if (!ua) return false

  for (i = 0; i < agent._conf.ignoreUserAgentStr.length; i++) {
    if (ua.indexOf(agent._conf.ignoreUserAgentStr[i]) === 0) return true
  }
  for (i = 0; i < agent._conf.ignoreUserAgentRegExp.length; i++) {
    if (agent._conf.ignoreUserAgentRegExp[i].test(ua)) return true
  }

  return false
}

function formatURL (item) {
  return {
    href: item.href,
    pathname: item.pathname,
    path: item.pathname + (item.search || ''),
    protocol: item.protocol,
    host: item.host,
    port: item.port,
    hostname: item.hostname,
    hash: item.hash,
    search: item.search
  }
}

// NOTE: This will also stringify and parse URL instances
// to a format which can be mixed into the options object.
function ensureUrl (v) {
  if (typeof v === 'string') {
    return formatURL(parseUrl(v))
  } else if (url.URL && v instanceof url.URL) {
    return formatURL(v)
  } else {
    return v
  }
}

function getSafeHost (res) {
  return res.getHeader ? res.getHeader('Host') : res._headers.host
}

exports.traceOutgoingRequest = function (agent, moduleName, method) {
  var ins = agent._instrumentation

  return function (orig) {
    return function (...args) {
      // TODO: See if we can delay the creation of span until the `response`
      // event is fired, while still having it have the correct stack trace
      var span = agent.startSpan(null, 'external', moduleName, 'http')
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to %s.%s %o', moduleName, method, { id: id })

      var options = {}
      var newArgs = [options]
      for (const arg of args) {
        if (typeof arg === 'function') {
          newArgs.push(arg)
        } else {
          Object.assign(options, ensureUrl(arg))
        }
      }

      if (!options.headers) options.headers = {}

      // Attempt to use the span context as a traceparent header.
      // If the transaction is unsampled the span will not exist,
      // however a traceparent header must still be propagated
      // to indicate requested services should not be sampled.
      // Use the transaction context as the parent, in this case.
      var parent = span || agent.currentTransaction
      if (parent && parent._context && shouldPropagateTraceContext(options)) {
        options.headers['elastic-apm-traceparent'] = parent._context.toString()
      }

      var req = orig.apply(this, newArgs)
      if (!span) return req

      if (getSafeHost(req) === agent._conf.serverHost) {
        agent.logger.debug('ignore %s request to intake API %o', moduleName, { id: id })
        return req
      } else {
        var protocol = req.agent && req.agent.protocol
        agent.logger.debug('request details: %o', { protocol: protocol, host: getSafeHost(req), id: id })
      }

      ins.bindEmitter(req)

      span.name = req.method + ' ' + getSafeHost(req) + parseUrl(req.path).pathname

      // TODO: Research if it's possible to add this to the prototype instead.
      // Or if it's somehow preferable to listen for when a `response` listener
      // is added instead of when `response` is emitted.
      const emit = req.emit
      req.emit = function (type, res) {
        if (type === 'response') onresponse(res)
        return emit.apply(req, arguments)
      }

      let url
      httpRequestToUrl(req).then(_url => {
        url = _url
      }).catch(() => {
        agent.logger.warn('unable to identify http.ClientRequest url %o', { id: id })
      })

      return req

      function onresponse (res) {
        // Work around async_hooks bug in Node.js 12.0 - 12.2 (https://github.com/nodejs/node/pull/27477)
        ins._recoverTransaction(span.transaction)

        agent.logger.debug('intercepted http.ClientRequest response event %o', { id: id })
        ins.bindEmitter(res)

        res.prependListener('end', onEnd)

        function onEnd () {
          agent.logger.debug('intercepted http.IncomingMessage end event %o', { id: id })

          span.setHttpContext({
            method: req.method,
            status_code: this.statusCode,
            url
          })

          span.end()
        }
      }
    }
  }
}

function shouldPropagateTraceContext (opts) {
  return !isAWSSigned(opts)
}

function isAWSSigned (opts) {
  const auth = opts.headers && (opts.headers.Authorization || opts.headers.authorization)
  return typeof auth === 'string' ? auth.startsWith('AWS4-') : false
}
