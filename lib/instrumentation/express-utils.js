'use strict'

var parseUrl = require('parseurl')
var symbols = require('../symbols')

function ensureSlash (value) {
  return value[0] === '/' ? value : '/' + value
}

function excludeRoot (value) {
  return value !== '/'
}

function join (parts) {
  return parts.filter(excludeRoot).map(ensureSlash).join('')
}

// This works for both express AND restify
function routePath (req) {
  var route = req.route
  // support other node framework
  if (!route) {
    return parseUrl(req).pathname
  }
  return route.path || (route.regexp && route.regexp.source) || ''
}

function getStackPath (req) {
  var stack = req[symbols.expressMountStack]
  var res = stack && stack.length && join(stack)
  return res !== '.' && res
}

// This function is also able to extract the path from a Restify request as
// it's storing the route name on req.route.path as well
function getPathFromRequest (req, useBase) {
  // Static serving route
  if (req[symbols.staticFile]) {
    return 'static file'
  }

  var path = getStackPath(req)
  var route = routePath(req)

  if (route) {
    return path ? join([ path, route ]) : route
  }

  if (useBase) {
    return path
  }
}

module.exports = {
  getPathFromRequest,
  getStackPath,
  routePath
}
