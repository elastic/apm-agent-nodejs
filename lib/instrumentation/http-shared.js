'use strict'

var url = require('url')
var semver = require('semver')
var eos = require('end-of-stream')
var debug = require('debug')('opbeat')

var SUPPORT_PREFINISH = semver.satisfies(process.version, '>=0.12')

exports.instrumentRequest = function (agent, moduleName) {
  return function (orig) {
    return function (event, req, res) {
      if (event === 'request') {
        debug('intercepted request event call to %s.Server.prototype.emit', moduleName)

        if (isRequestBlacklisted(agent, req)) {
          debug('ignoring blacklisted request to %s', req.url)
          // don't leak previous transaction
          agent._instrumentation.currentTransaction = null
        } else {
          var trans = agent.startTransaction()
          trans.type = 'request'
          trans.req = req

          eos(res, function (err) {
            if (!err) return trans.end()

            if (agent.timeout.active && !trans.ended) {
              var duration = Date.now() - trans._start
              if (duration > agent.timeout.errorThreshold) {
                agent.captureError('Socket closed with active HTTP request (>' + (agent.timeout.errorThreshold / 1000) + ' sec)', {
                  request: req,
                  extra: { abortTime: duration }
                })
              }
            }

            // Handle case where res.end is called after an error occurred on the
            // stream (e.g. if the underlying socket was prematurely closed)
            if (SUPPORT_PREFINISH) {
              res.on('prefinish', function () {
                trans.end()
              })
            } else {
              res.on('finish', function () {
                trans.end()
              })
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

  for (i = 0; i < agent._ignoreUrlStr.length; i++) {
    if (agent._ignoreUrlStr[i] === req.url) return true
  }
  for (i = 0; i < agent._ignoreUrlRegExp.length; i++) {
    if (agent._ignoreUrlRegExp[i].test(req.url)) return true
  }

  var ua = req.headers['user-agent']
  if (!ua) return false

  for (i = 0; i < agent._ignoreUserAgentStr.length; i++) {
    if (ua.indexOf(agent._ignoreUserAgentStr[i]) === 0) return true
  }
  for (i = 0; i < agent._ignoreUserAgentRegExp.length; i++) {
    if (agent._ignoreUserAgentRegExp[i].test(ua)) return true
  }

  return false
}

exports.traceOutgoingRequest = function (agent, moduleName) {
  var traceType = 'ext.' + moduleName + '.http'

  return function (orig) {
    return function () {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to %s.request %o', moduleName, { uuid: uuid })

      var req = orig.apply(this, arguments)
      if (!trace) return req
      if (req._headers.host === agent._apiHost) {
        debug('ignore %s request to opbeat server %o', moduleName, { uuid: uuid })
        return req
      } else {
        var protocol = req.agent && req.agent.protocol
        debug('request details: %o', { protocol: protocol, host: req._headers.host, uuid: uuid })
      }

      var name = req.method + ' ' + req._headers.host + url.parse(req.path).pathname
      trace.start(name, traceType)
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        debug('intercepted http.ClientRequest response event %o', { uuid: uuid })

        // Inspired by:
        // https://github.com/nodejs/node/blob/9623ce572a02632b7596452e079bba066db3a429/lib/events.js#L258-L274
        if (res.prependListener) {
          // Added in Node.js 6.0.0
          res.prependListener('end', onEnd)
        } else {
          var existing = res._events && res._events.end
          if (!existing) {
            res.on('end', onEnd)
          } else {
            if (typeof existing === 'function') {
              res._events.end = [onEnd, existing]
            } else {
              existing.unshift(onEnd)
            }
          }
        }

        function onEnd () {
          debug('intercepted http.IncomingMessage end event %o', { uuid: uuid })
          trace.end()
        }
      }
    }
  }
}
