'use strict'

var shimmer = require('shimmer')

var SERVER_FNS = ['on', 'addListener']

module.exports = function (http, agent) {
  agent.logger.trace('shimming http.Server.prototype functions:', SERVER_FNS)

  shimmer.massWrap(http.Server.prototype, SERVER_FNS, function (orig, name) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return orig.call(this, event, onRequest)
      else return orig.apply(this, arguments)

      function onRequest (req, res) {
        agent.logger.trace('intercepted call to http.Server.prototype.%s', name)

        var trans = agent.startTransaction(req.method + ' ' + req.url, 'web.http')
        trans.req = req

        res.once('finish', function () {
          var path

          // Get proper route name from Express 4.x
          if (req.route) {
            path = req.route.path || req.route.regexp && req.route.regexp.source
          }

          if (!path) {
            agent.logger.warn('[%s] could not extract route name from request', trans._uuid)
            path = 'unknown route'
          }

          trans._defaultName = req.method + ' ' + path

          trans.result = res.statusCode
          agent.logger.trace('[%s] ending transaction', trans._uuid)
          trans.end()
        })

        listener.apply(this, arguments)
      }
    }
  })

  agent.logger.trace('shimming http.request function')

  shimmer.wrap(http, 'request', function (orig, name) {
    return function () {
      var trace = agent.buildTrace()
      var uuid = trace ? trace.transaction._uuid : 'n/a'

      agent.logger.trace('[%s] intercepted call to http.request (transaction: %s)', uuid, trace ? 'exists' : 'missing')

      var req = orig.apply(this, arguments)
      if (!trace) return req
      if (req._headers.host === agent._apiHost) {
        agent.logger.trace('[%s] ignore http request to opbeat server', uuid)
        return req
      } else {
        agent.logger.trace('[%s] detected host:', uuid, req._headers.host)
      }

      var name = req.method + ' ' + req._headers.host
      trace.start(name, 'ext.http.http')
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        agent.logger.trace('[%s] intercepted http.ClientRequest response event', uuid)
        res.on('end', function () {
          agent.logger.trace('[%s] intercepted http.IncomingMessage end event', uuid)
          trace.end()
        })
      }
    }
  })

  return http
}
