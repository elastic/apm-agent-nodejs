'use strict'

var sym = require('../symbols')

exports.getPathFromRequest = function (req) {
  var path

  // Get proper route name from Express 4.x
  if (req[sym.staticFile]) {
    path = 'static file'
  } else if (req.route) {
    path = req.route.path || (req.route.regexp && req.route.regexp.source) || ''
    if (req[sym.expressMountStack]) path = req[sym.expressMountStack].join('') + (path === '/' ? '' : path)
  } else if (req[sym.expressMountStack] && req[sym.expressMountStack].length > 0) {
    // in the case of custom middleware that terminates the request
    // so it doesn't reach the regular router (like express-graphql),
    // the req.route will not be set, but we'll see something on the
    // mountstack and simply use that
    path = req[sym.expressMountStack].join('')
  }

  return path
}
