'use strict'

exports.getPathFromRequest = function (req) {
  var path

  // Get proper route name from Express 4.x
  if (req._elastic_apm_static) {
    path = 'static file'
  } else if (req.route) {
    path = req.route.path || (req.route.regexp && req.route.regexp.source) || ''
    if (req._elastic_apm_mountstack) path = req._elastic_apm_mountstack.join('') + (path === '/' ? '' : path)
  } else if (req._elastic_apm_mountstack && req._elastic_apm_mountstack.length > 0) {
    // in the case of custom middleware that terminates the request
    // so it doesn't reach the regular router (like express-graphql),
    // the req.route will not be set, but we'll see something on the
    // mountstack and simply use that
    path = req._elastic_apm_mountstack.join('')
  }

  return path
}
