'use strict'

var symbols = require('../symbols')

// This function is also able to extract the path from a Restify request as
// it's storing the route name on req.route.path as well
exports.getPathFromRequest = function (req) {
  var path

  // Get proper route name from Express 4.x
  if (req[symbols.staticFile]) {
    path = 'static file'
  } else if (req.route) {
    path = req.route.path || (req.route.regexp && req.route.regexp.source) || ''
    if (req[symbols.expressMountStack]) path = req[symbols.expressMountStack].join('') + (path === '/' ? '' : path)
  } else if (req[symbols.expressMountStack] && req[symbols.expressMountStack].length > 0) {
    // in the case of custom middleware that terminates the request
    // so it doesn't reach the regular router (like express-graphql),
    // the req.route will not be set, but we'll see something on the
    // mountstack and simply use that
    path = req[symbols.expressMountStack].join('')
  }

  return path
}
