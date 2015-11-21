'use strict'

var shimmer = require('shimmer')
var debug = require('debug')('opbeat')

module.exports = function (https, agent) {
  debug('shimming https.request function')

  shimmer.wrap(https, 'request', function (orig, name) {
    return function () {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to https.request', { uuid: uuid })

      var req = orig.apply(this, arguments)
      if (!trace) return req
      if (req._headers.host === agent._apiHost) {
        debug('ignore http request to opbeat server', { uuid: uuid })
        return req
      }

      var name = req.method + ' ' + req._headers.host
      trace.start(name, 'ext.https.http')
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

  return https
}
