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

        var name = req.method + ' unknown route'
        var trans = agent.startTransaction(name, traceType)
        trans.req = req

        if (agent.timeout.active) {
          req.on('aborted', function () {
            trans._aborted()
          })

          // listening for the timeout event have side-effects, let's patch the
          // emit function instead
          shimmer.wrap(res, 'emit', function wrapEmit (original) {
            return function wrappedEmit (event) {
              switch (event) {
                case 'timeout':
                  // TODO: If the socket isn't close it appears that more than
                  // one timeout event can be fired. This seems to occur if
                  // someone writes to the socket after the timeout event have
                  // fired. I guess this is because the timeout timer resets
                  // after each write
                  trans.timeout()
                  break
                case 'prefinish':
                  prefinish(res, trans)
                  break
                case 'finish':
                  trans._rootTrace.touch()
                  trans.end()
                  break
              }
              return original.apply(this, arguments)
            }
          })

          if (!SUPPORT_PREFINISH) {
            shimmer.wrap(res, 'end', function wrapEnd (original) {
              return function wrappedEnd () {
                prefinish(res, trans)
                return original.apply(this, arguments)
              }
            })
          }
        } else {
          res.on('finish', function () {
            prefinish(res, trans)
            trans.end()
          })
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
      return
    }

    trans.setDefaultName(req.method + ' ' + path)
  }

  trans.result = res.statusCode
  trans._prefinish()
}
