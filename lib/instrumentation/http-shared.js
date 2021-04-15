'use strict'

var url = require('url')
var endOfStream = require('end-of-stream')

var { parseUrl } = require('../parsers')
var { getHTTPDestination } = require('./context')

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
          var traceparent = req.headers['elastic-apm-traceparent'] || req.headers.traceparent
          var tracestate = req.headers.tracestate
          var trans = agent.startTransaction(null, null, {
            childOf: traceparent,
            tracestate: tracestate
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
  for (i = 0; i < agent._conf.transactionIgnoreUrlRegExp.length; i++) {
    if (agent._conf.transactionIgnoreUrlRegExp[i].test(req.url)) return true
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
        const headerValue = parent._context.toTraceParentString()
        const traceStateValue = parent._context.toTraceStateString()

        options.headers.traceparent = headerValue
        options.headers.tracestate = traceStateValue
        if (agent._conf.useElasticTraceparentHeader) {
          options.headers['elastic-apm-traceparent'] = headerValue
        }
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
        if (type === 'abort') onAbort(type)
        return emit.apply(req, arguments)
      }

      const url = getUrlFromRequestAndOptions(req, options, moduleName + ':')
      if (!url) {
        agent.logger.warn('unable to identify http.ClientRequest url %o', { id: id })
      }
      let statusCode
      return req

      // In case the request is ended prematurely
      function onAbort (type) {
        if (span.ended) return
        agent.logger.debug('intercepted http.ClientRequest abort event %o', { id: id })

        onEnd()
      }

      function onEnd () {
        span.setHttpContext({
          method: req.method,
          status_code: statusCode,
          url
        })

        // Add destination info only when socket conn is established
        if (url) {
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
        }

        span._setOutcomeFromHttpStatusCode(statusCode)
        span.end()
      }

      function onresponse (res) {
        // Work around async_hooks bug in Node.js 12.0 - 12.2 (https://github.com/nodejs/node/pull/27477)
        ins._recoverTransaction(span.transaction)

        agent.logger.debug('intercepted http.ClientRequest response event %o', { id: id })
        ins.bindEmitter(res)

        statusCode = res.statusCode

        res.prependListener('end', function () {
          agent.logger.debug('intercepted http.IncomingMessage end event %o', { id: id })

          onEnd()
        })
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

// Creates a sanitized URL suitable for the span's HTTP context
//
// This function reconstructs a URL using the request object's properties
// where it can (node versions v14.5.0, v12.19.0 and later) , and falling
// back to the options where it can not.  This function also strips any
// authentication information provided with the hostname.  In other words
//
// http://username:password@example.com/foo
//
// becomes http://example.com/foo
//
// NOTE: The options argument may not be the same options that are passed
// to http.request if the caller uses the the http.request(url,options,...)
// method signature. The agent normalizes the url and options into a single
// options array. This function expects those pre-normalized options.
//
// @param {ClientRequest} req
// @param {object} options
// @param {string} fallbackProtocol
// @return string|undefined
function getUrlFromRequestAndOptions (req, options, fallbackProtocol) {
  if (!req) {
    return undefined
  }
  options = options || {}
  req = req || {}
  req.agent = req.agent || {}

  const port = options.port ? `:${options.port}` : ''
  // req.host and req.protocol are node versions v14.5.0/v12.19.0 and later
  const host = req.host || options.hostname || options.host || 'localhost'
  const protocol = req.protocol || req.agent.protocol || fallbackProtocol

  return `${protocol}//${host}${port}${req.path}`
}

exports.getUrlFromRequestAndOptions = getUrlFromRequestAndOptions
