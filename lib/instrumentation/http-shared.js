'use strict'

var url = require('url')

var endOfStream = require('end-of-stream')

const transactionForResponse = new WeakMap()
exports.transactionForResponse = transactionForResponse

exports.instrumentRequest = function (agent, moduleName) {
  var ins = agent._instrumentation
  return function (orig) {
    return function (event, req, res) {
      if (event === 'request') {
        agent.logger.debug('intercepted request event call to %s.Server.prototype.emit', moduleName)

        if (isRequestBlacklisted(agent, req)) {
          agent.logger.debug('ignoring blacklisted request to %s', req.url)
          // don't leak previous transaction
          agent._instrumentation.currentTransaction = null
        } else {
          var trans = agent.startTransaction()
          trans.type = 'request'
          trans.req = req
          trans.res = res

          transactionForResponse.set(res, trans)

          ins.bindEmitter(req)
          ins.bindEmitter(res)

          endOfStream(res, function (err) {
            if (!err) return trans.end()

            if (agent._conf.errorOnAbortedRequests && !trans.ended) {
              var duration = Date.now() - trans._timer.start
              if (duration > agent._conf.abortedErrorThreshold) {
                agent.captureError('Socket closed with active HTTP request (>' + (agent._conf.abortedErrorThreshold / 1000) + ' sec)', {
                  request: req,
                  extra: { abortTime: duration }
                })
              }
            }

            // Handle case where res.end is called after an error occurred on the
            // stream (e.g. if the underlying socket was prematurely closed)
            res.on('prefinish', function () {
              trans.end()
            })
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

exports.traceOutgoingRequest = function (agent, moduleName) {
  var spanType = 'ext.' + moduleName + '.http'
  var ins = agent._instrumentation

  return function (orig) {
    return function () {
      var span = agent.buildSpan()
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to %s.request %o', moduleName, { id: id })

      var req = orig.apply(this, arguments)
      if (!span) return req
      if (req._headers.host === agent._conf.serverHost) {
        agent.logger.debug('ignore %s request to intake API %o', moduleName, { id: id })
        return req
      } else {
        var protocol = req.agent && req.agent.protocol
        agent.logger.debug('request details: %o', { protocol: protocol, host: req._headers.host, id: id })
      }

      ins.bindEmitter(req)

      var name = req.method + ' ' + req._headers.host + url.parse(req.path).pathname
      span.start(name, spanType)
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        agent.logger.debug('intercepted http.ClientRequest response event %o', { id: id })
        ins.bindEmitter(res)

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
          agent.logger.debug('intercepted http.IncomingMessage end event %o', { id: id })
          span.end()
        }
      }
    }
  }
}
