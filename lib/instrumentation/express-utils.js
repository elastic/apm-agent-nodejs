/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const url = require('url');

var symbols = require('../symbols');

function normalizeSlash(value) {
  return value[0] === '/' ? value : '/' + value;
}

function excludeRoot(value) {
  return value !== '/';
}

function join(parts) {
  if (!parts) return;
  return parts.filter(excludeRoot).map(normalizeSlash).join('') || '/';
}

// This works for both express AND restify
function routePath(route) {
  if (!route) return;
  return route.path || (route.regexp && route.regexp.source);
}

function getStackPath(req) {
  var stack = req[symbols.expressMountStack];
  return join(stack);
}

// This function is also able to extract the path from a Restify request as
// it's storing the route name on req.route.path as well
function getPathFromRequest(req, useBase, usePathAsTransactionName) {
  if (req[symbols.staticFile]) {
    return 'static file';
  }

  var path = getStackPath(req);
  var route = routePath(req.route);

  if (route) {
    return path ? join([path, route]) : route;
  } else if (path && (path !== '/' || useBase)) {
    return path;
  }

  if (usePathAsTransactionName) {
    // `req.url` is the "request-target" from the HTTP request line
    // (https://www.rfc-editor.org/rfc/rfc7230#section-3.1.1). The special-case
    // handling for leading '/' is because this:
    //    GET //foo/bar HTTP/1.1
    //    Host: example.com
    // should result in:
    //    { host: 'example.com', pathname: '//foo/bar' }
    // and *not*:
    //    { host: 'foo', pathname: '/bar' }
    //
    // Assuming 'http://' for the `base` URL is fine, because we don't use the
    // protocol.
    const base = 'http://' + (req.headers && req.headers.host);
    const parsed = req.url.startsWith('/')
      ? new url.URL(base + req.url)
      : new url.URL(req.url, base);
    return parsed && parsed.pathname;
  }
}

module.exports = {
  getPathFromRequest,
  getStackPath,
  routePath,
};
