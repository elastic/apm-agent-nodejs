'use strict'

var debug = require('debug')('opbeat')

exports.instrumentRequest = function (agent, moduleName) {
  var traceType = 'web.' + moduleName

  return function (orig) {
    return function (event, req, res) {
      if (event === 'request') {
        debug('intercepted request event call to %s.Server.prototype.emit', moduleName)

        var trans = agent.startTransaction(null, traceType)
        trans.req = req

        res.on('finish', function () {
          if (!trans._defaultName) {
            var path

            // Get proper route name from Express 4.x
            if (req._opbeat_static) {
              path = 'static file'
            } else if (req.route) {
              path = req.route.path || req.route.regexp && req.route.regexp.source || ''
              if (req._opbeat_mountstack) path = req._opbeat_mountstack.join('') + (path === '/' ? '' : path)
            }

            if (!path) {
              debug('could not extract route name from request %o', {
                url: req.url,
                type: typeof path,
                null: path === null, // because typeof null === 'object'
                route: !!req.route,
                regex: req.route ? !!req.route.regexp : false,
                mountstack: req._opbeat_mountstack ? req._opbeat_mountstack.length : false,
                uuid: trans._uuid
              })
              path = 'unknown route'
            }

            trans.setDefaultName(req.method + ' ' + path)
          }

          trans.result = res.statusCode
          debug('ending transaction %o', { uuid: trans._uuid })
          trans.end()
        })
      }

      orig.apply(this, arguments)
    }
  }
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

      var name = req.method + ' ' + req._headers.host
      trace.start(name, traceType)
      req.on('response', onresponse)

      return req

      function onresponse (res) {
        debug('intercepted http.ClientRequest response event %o', { uuid: uuid })
        res.on('end', function () {
          debug('intercepted http.IncomingMessage end event %o', { uuid: uuid })
          trace.end()
        })
      }
    }
  }
}
