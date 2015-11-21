'use strict'

var shimmer = require('shimmer')
var debug = require('debug')('opbeat')

var SERVER_FNS = ['on', 'addListener']

module.exports = function (http, agent) {
  debug('shimming http.Server.prototype functions:', SERVER_FNS)

  shimmer.massWrap(http.Server.prototype, SERVER_FNS, function (orig, name) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return orig.call(this, event, onRequest)
      else return orig.apply(this, arguments)

      function onRequest (req, res) {
        debug('intercepted call to http.Server.prototype.%s', name)

        var trans = agent.startTransaction(req.method + ' ' + req.url, 'web.http')
        trans.req = req

        res.once('finish', function () {
          var path

          // Get proper route name from Express 4.x
          if (req.route) {
            path = req.route.path || req.route.regexp && req.route.regexp.source
          }

          if (!path) {
            debug('could not extract route name from request', { url: req.url, uuid: trans._uuid })
            path = 'unknown route'
          }

          trans._defaultName = req.method + ' ' + path

          trans.result = res.statusCode
          debug('ending transaction', { uuid: trans._uuid })
          trans.end()
        })

        listener.apply(this, arguments)
      }
    }
  })

  debug('shimming http.request function')

  shimmer.wrap(http, 'request', function (orig, name) {
    return function () {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to http.request', { uuid: uuid })

      var req = orig.apply(this, arguments)
      if (!trace) return req
      if (req._headers.host === agent._apiHost) {
        debug('ignore http request to opbeat server', { uuid: uuid })
        return req
      } else {
        debug('detected host: %s', req._headers.host, { uuid: uuid })
      }

      var name = req.method + ' ' + req._headers.host
      trace.start(name, 'ext.http.http')
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        debug('intercepted http.ClientRequest response event', { uuid: uuid })
        res.on('end', function () {
          debug('intercepted http.IncomingMessage end event', { uuid: uuid })
          trace.end()
        })
      }
    }
  })

  return http
}
