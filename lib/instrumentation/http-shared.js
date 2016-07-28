'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('./shimmer')

var SUPPORT_PREFINISH = semver.satisfies(process.version, '>=0.12')

exports.instrumentRequest = function (agent, moduleName) {
  var traceType = 'web.' + moduleName

  return function (orig) {
    return function (event, req, res) {
      if (event === 'request') {
        debug('intercepted request event call to %s.Server.prototype.emit', moduleName)

        var trans = agent.startTransaction(null, traceType)
        trans.req = req

        if (agent.timeout.active) {
          var onClose = function onClose () {
            if (trans.ended) return // listener should be removed, but just in case

            var duration = Date.now() - trans._start

            prefinish(res, trans)

            if (duration > agent.timeout.errorThreshold) {
              agent.captureError('Socket closed with active HTTP request (>' + (agent.timeout.errorThreshold / 1000) + ' sec)', {
                request: req,
                extra: { abortTime: duration }
              })
              trans.result = agent.timeout.errorResult
            }

            trans.end()

            res.removeListener('finish', onFinish)
            if (SUPPORT_PREFINISH) res.removeListener('prefinish', onPrefinish)
            else shimmer.unwrap(res, 'end')
          }

          var onPrefinish = function onPrefinish () {
            if (trans.ended) return // listener should be removed, but just in case
            res.removeListener('close', onClose)
            prefinish(res, trans)
          }

          var onFinish = function onFinish () {
            if (trans.ended) return // listener should be removed, but just in case
            trans._rootTrace.touch()
            trans.end()
          }

          res.on('close', onClose)
          res.on('finish', onFinish)

          if (SUPPORT_PREFINISH) {
            res.on('prefinish', onPrefinish)
          } else {
            shimmer.wrap(res, 'end', function wrapEnd (original) {
              return function wrappedEnd () {
                onPrefinish()
                return original.apply(this, arguments)
              }
            })
          }
        } else {
          if (SUPPORT_PREFINISH) {
            res.on('prefinish', function () {
              prefinish(res, trans)
              trans.end()
            })
          } else {
            shimmer.wrap(res, 'end', function wrapEnd (original) {
              return function wrappedEnd () {
                prefinish(res, trans)
                trans.end()
                return original.apply(this, arguments)
              }
            })
          }
        }
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

function prefinish (res, trans) {
  trans._rootTrace.touch()

  if (!trans._defaultName) {
    var req = trans.req
    var path

    // Get proper route name from Express 4.x
    if (req._opbeat_static) {
      path = 'static file'
    } else if (req.route) {
      path = req.route.path || req.route.regexp && req.route.regexp.source || ''
      if (req._opbeat_mountstack) path = req._opbeat_mountstack.join('') + (path === '/' ? '' : path)
    } else if (req._opbeat_mountstack && req._opbeat_mountstack.length > 0) {
      // in the case of custom middleware that terminates the request
      // so it doesn't reach the regular router (like express-graphql),
      // the req.route will not be set, but we'll see something on the
      // mountstack and simply use that
      path = req._opbeat_mountstack.join('')
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
}
