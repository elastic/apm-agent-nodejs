'use strict'

var shimmer = require('shimmer')

module.exports = function (https, agent) {
  agent.logger.trace('shimming https.request function')

  shimmer.wrap(https, 'request', function (orig, name) {
    return function () {
      var trace = agent.buildTrace()
      var uuid = trace ? trace.transaction._uuid : 'n/a'

      agent.logger.trace('[%s] intercepted call to https.request (transaction: %s)', uuid, trace ? 'exists' : 'missing')

      var req = orig.apply(this, arguments)
      if (!trace) return req
      if (req._headers.host === agent._apiHost) {
        agent.logger.trace('[%s] ignore http request to opbeat server', uuid)
        return req
      }

      var name = req.method + ' ' + req._headers.host
      trace.start(name, 'ext.https.http')
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

  return https
}
