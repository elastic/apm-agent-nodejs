'use strict'

var shimmer = require('shimmer')
var semver = require('semver')
var debug = require('debug')('opbeat')

module.exports = function (https, agent, version) {
  debug('shimming https.Server.prototype.emit function')

  shimmer.wrap(https.Server.prototype, 'emit', function (orig, name) {
    return function (event, req, res) {
      if (event === 'request') {
        debug('intercepted request event call to https.Server.prototype.emit')

        var trans = agent.startTransaction(null, 'web.https')
        trans.req = req

        res.once('finish', function () {
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
  })

  // From Node v0.11.12 and onwards, https requests just uses the http.request
  // function. So to avoid creating a trace twice for the same request, we'll
  // only instrument the https.request function if the Node version is less
  // than 0.11.12
  //
  // The change was introduced in:
  // https://github.com/nodejs/node/commit/d6bbb19f1d1d6397d862d09304bc63c476f675c1
  if (semver.lt(version, '0.11.12')) {
    debug('shimming https.request function')

    shimmer.wrap(https, 'request', function (orig, name) {
      return function () {
        var trace = agent.buildTrace()
        var uuid = trace && trace.transaction._uuid

        debug('intercepted call to https.request %o', { uuid: uuid })

        var req = orig.apply(this, arguments)
        if (!trace) return req
        if (req._headers.host === agent._apiHost) {
          debug('ignore http request to opbeat server %o', { uuid: uuid })
          return req
        } else {
          var protocol = req.agent && req.agent.protocol
          debug('request details: %o', { protocol: protocol, host: req._headers.host, uuid: uuid })
        }

        var name = req.method + ' ' + req._headers.host
        trace.start(name, 'ext.https.http')
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
    })
  }

  return https
}
