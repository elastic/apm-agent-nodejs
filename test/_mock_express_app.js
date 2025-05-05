/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const http = require('http');

/**
 * @param {Map<string, any>} routes
 * @param {http.IncomingMessage} req
 * @returns {((req, res) => void ) | undefined}
 */
function getRouteHandler(routes, req) {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();
  let path = url.pathname;
  let handler = routes.get(`${method} ${path}`);

  if (!handler) {
    // Some routes are defined wihtout a final slash `/`
    path = path.replace(/\/$/, '');
    handler = routes.get(`${method} ${path}`);
  }

  // Express sets metadata about the hit route
  if (handler) {
    req.route = { path };
  }
  return handler;
}

/**
 * @param {http.IncomingMessage} req
 * @returns {any}
 */
function makeExpressReq(req) {
  const url = new URL(req.url, 'http://localhost');
  req.header = (name) => req.headers[name.toLowerCase()];
  req.query = {};
  url.searchParams.forEach((val, key) => {
    req.query[key] = val;
  });
  return req;
}

/**
 * @param {http.ServerResponse} res
 * @returns {any}
 */
function makeExpressRes(res) {
  res.set = res.setHeader;
  res.status = function (code) {
    this.statusCode = code;
  };
  res.send = function (data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);

    if (!this.statusCode) {
      this.statusCode = 200;
    }
    if (!this.getHeader('content-type')) {
      this.setHeader('content-type', 'application/json');
    }
    this.setHeader('content-length', payload.length);
    this.write(payload);
    this.end();
  };
  return res;
}

/**
 * this function returns a HTTP server which replaces the previous usage of `express`
 * for mocking cloud metadata responses.
 */
function createMockExpressApp() {
  const routes = new Map();
  const server = http.createServer((req, res) => {
    const handler = getRouteHandler(routes, req);
    if (typeof handler === 'function') {
      // make express like req & res
      const expReq = makeExpressReq(req);
      const expRes = makeExpressRes(res);
      return handler(expReq, expRes);
    }

    res.writeHead(404, 'Not found');
    res.end();
  });

  // return express like app object
  return {
    _server: server,
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    post: (path, handler) => routes.set(`POST ${path}`, handler),
    put: (path, handler) => routes.set(`PUT ${path}`, handler),
    listen: server.listen.bind(server),
  };
}

module.exports = createMockExpressApp;
