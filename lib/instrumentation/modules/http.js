'use strict'

var shimmer = require('shimmer')
var asyncState = require('../../async-state')

var SERVER_FNS = ['on', 'addListener']

module.exports = function (http, client) {
  client.logger.trace('shimming http.Server.prototype functions:', SERVER_FNS)

  shimmer.massWrap(http.Server.prototype, SERVER_FNS, function (orig, name) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return orig.call(this, event, onRequest)
      else return orig.apply(this, arguments)

      function onRequest (req, res) {
        client.logger.trace('intercepted call to http.Server.prototype.%s', name)

        var trans = client.startTransaction(req.method + ' ' + req.url, 'web.http')
        asyncState.req = req
        asyncState.trans = req.__opbeat_trans = trans

        res.once('finish', function () {
          trans.result = res.statusCode
          client.logger.trace('[%s] ending transaction', trans._uuid)
          trans.end()
        })

        listener.apply(this, arguments)
      }
    }
  })

  return http
}
