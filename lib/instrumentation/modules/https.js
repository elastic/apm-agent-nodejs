'use strict'

var shimmer = require('shimmer')

module.exports = function (https, client) {
  client.logger.trace('shimming https.request function')

  shimmer.wrap(https, 'request', function (orig, name) {
    return function () {
      var trans = client.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      client.logger.trace('[%s] intercepted call to https.request (transaction: %sactive)', uuid, trans ? '' : 'in')

      var req = orig.apply(this, arguments)
      if (!trans) return req
      if (req._headers.host === client._apiHost) {
        client.logger.trace('[%s] ignore http request to opbeat server', uuid)
        return req
      }

      var name = req.method + ' ' + req._headers.host
      var trace = trans.startTrace(name, 'ext.https.http')
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        client.logger.trace('[%s] intercepted http.ClientRequest response event', uuid)
        res.on('end', function () {
          client.logger.trace('[%s] intercepted http.IncomingMessage end event', uuid)
          trace.end()
        })
      }
    }
  })

  return https
}
