'use strict'

var shimmer = require('shimmer')

module.exports = function (https, agent) {
  agent.logger.trace('shimming https.request function')

  shimmer.wrap(https, 'request', function (orig, name) {
    return function () {
      var trans = agent.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      agent.logger.trace('[%s] intercepted call to https.request (transaction: %sactive)', uuid, trans ? '' : 'in')

      var req = orig.apply(this, arguments)
      if (!trans) return req
      if (req._headers.host === agent._apiHost) {
        agent.logger.trace('[%s] ignore http request to opbeat server', uuid)
        return req
      }

      var name = req.method + ' ' + req._headers.host
      var trace = trans.startTrace(name, 'ext.https.http')
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
