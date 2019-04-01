'use strict'

var parseUrl
try {
  parseUrl = require('parseurl')
} catch (e) {
  parseUrl = require('url').parse
}
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
function routePath (route) {
  if (!route) return ''
  return route.path || (route.regexp && route.regexp.source) || ''
}

function getStackPath (req) {
  var stack = req[symbols.expressMountStack]
  var res = stack && stack.length && join(stack)
  return res !== '.' && res
}

// This function is also able to extract the path from a Restify request as
// it's storing the route name on req.route.path as well
function getPathFromRequest (req, useBase, usePathAsTransactionName) {
  // Static serving route
  if (req[symbols.staticFile]) {
    return 'static file'
  }

  var path = getStackPath(req)
  var route = routePath(req.route)

  if (route) {
    return path ? join([ path, route ]) : route
  }

  if (useBase) {
    return path
  }

  // Enable usePathAsTransactionName config
  if (usePathAsTransactionName) {
    const parsed = parseUrl(req)
    return parsed && parsed.pathname
  }
}

module.exports = {
  getPathFromRequest,
  getStackPath,
  routePath
}
