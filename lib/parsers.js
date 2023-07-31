/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const url = require('url');

const basicAuth = require('basic-auth');
const getUrlFromRequest = require('original-url');
const parseHttpHeadersFromReqOrRes = require('http-headers');
const cookie = require('cookie');
const stringify = require('fast-safe-stringify');

const REDACTED = require('./constants').REDACTED;
const {
  redactKeysFromObject,
  redactKeysFromPostedFormVariables,
} = require('./filters/sanitize-field-names');

/**
 * Extract appropriate `{transaction,error}.context.request` from an HTTP
 * request object. This handles header and body capture and redaction
 * according to the agent config.
 *
 * @param {Object} req - Typically `req` is a Node.js `http.IncomingMessage`
 *    (https://nodejs.org/api/all.html#all_http_class-httpincomingmessage).
 *    However, some cases (e.g. Lambda and Azure Functions instrumentation)
 *    create a pseudo-req object that matches well enough for this function.
 *    Some relevant fields: (TODO: document all used fields)
 *    - `headers` - Required. An object.
 *    - `body` - The incoming request body, if available. The `json` and
 *      `payload` fields are also checked to accomodate some web frameworks.
 *    - `bodyIsBase64Encoded` - An optional boolean. If `true`, then the `body`
 *      needs to be base64-decoded before inclusion and redaction. Used by
 *      Lambda instrumentation in some cases (e.g. for ELB triggers).
 * @param {Object} conf - The full agent configuration.
 * @param {String} type - 'errors' or 'transactions'. Indicates if this req
 *    is being captured for an APM error or transaction event.
 */
function getContextFromRequest(req, conf, type) {
  var captureBody = conf.captureBody === type || conf.captureBody === 'all';

  var context = {
    http_version: req.httpVersion,
    method: req.method,
    url: getUrlFromRequest(req),
    headers: undefined,
  };
  if (req.socket && req.socket.remoteAddress) {
    context.socket = {
      remote_address: req.socket.remoteAddress,
    };
  }

  if (conf.captureHeaders) {
    context.headers = redactKeysFromObject(
      req.headers,
      conf.sanitizeFieldNamesRegExp,
    );

    // TODO: remove filterHttpHeaders option in next major release
    // https://github.com/elastic/apm-agent-nodejs/issues/3332
    if (conf.filterHttpHeaders && context.headers.cookie) {
      context.cookies = cookie.parse(req.headers.cookie);
      context.cookies = redactKeysFromObject(
        context.cookies,
        conf.sanitizeFieldNamesRegExp,
      );
      // Redact the cookie to avoid data duplication
      context.headers.cookie = REDACTED;
    }
  }

  var contentLength = parseInt(req.headers['content-length'], 10);
  var transferEncoding = req.headers['transfer-encoding'];
  var chunked =
    typeof transferEncoding === 'string' &&
    transferEncoding.toLowerCase() === 'chunked';
  var body = req.json || req.body || req.payload;
  var haveBody = body && (chunked || contentLength > 0);

  if (haveBody) {
    if (!captureBody) {
      context.body = '[REDACTED]';
    } else if (Buffer.isBuffer(body)) {
      context.body = '<Buffer>';
    } else {
      if (typeof body === 'string' && req.bodyIsBase64Encoded === true) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }
      body = redactKeysFromPostedFormVariables(
        body,
        req.headers,
        conf.sanitizeFieldNamesRegExp,
      );
      if (typeof body !== 'string') {
        body = tryJsonStringify(body) || stringify(body);
      }
      context.body = body;
    }
  }

  // TODO: Tempoary fix for https://github.com/elastic/apm-agent-nodejs/issues/813
  if (context.url && context.url.port) {
    context.url.port = String(context.url.port);
  }

  return context;
}

/**
 * Extract appropriate `{transaction,error}.context.response` from an HTTP
 * response object. This handles header redaction according to the agent config.
 *
 * @param {Object} res - Typically `res` is a Node.js `http.OutgoingMessage`
 *    (https://nodejs.org/api/http.html#class-httpoutgoingmessage).
 *    However, some cases (e.g. Lambda and Azure Functions instrumentation)
 *    create a pseudo-res object that matches well enough for this function.
 *    Some relevant fields: (TODO: document all used fields)
 *    - `statusCode` - Required. A number.
 *    - `headers` - An object.
 *    - `headersSent` - Boolean indicating if the headers have been sent
 *       (https://nodejs.org/api/http.html#outgoingmessageheaderssent)
 *    - `finished` - Boolean indicating if `response.end()` has been called
 *       (https://nodejs.org/api/http.html#responsefinished)
 * @param {Object} conf - The full agent configuration.
 * @param {Boolean} isError - Indicates if this response contains an error and
 *    some extra fields should be added to the context
 */
function getContextFromResponse(res, conf, isError) {
  var context = {
    status_code: res.statusCode,
    headers: undefined,
  };

  if (conf.captureHeaders) {
    context.headers = res.headers || parseHttpHeadersFromReqOrRes(res, true);
    context.headers = redactKeysFromObject(
      context.headers,
      conf.sanitizeFieldNamesRegExp,
    );
  }

  if (isError) {
    context.headers_sent = res.headersSent;
    if (typeof res.finished === 'boolean') {
      context.finished = res.finished;
    } else {
      context.finished = res.writableEnded;
    }
  }

  return context;
}

/**
 * Extract appropriate `{transaction,error}.context.user` from an HTTP
 * request object.
 *
 * @param {Object} req - Typically `req` is a Node.js `http.IncomingMessage`.
 *    However, some cases (e.g. Lambda and Azure Functions instrumentation)
 *    create a pseudo-req object that matches well enough for this function.
 *    Some relevant fields: (TODO: document all used fields)
 *    - `headers` - Required. An object.
 */
function getUserContextFromRequest(req) {
  var user = req.user || basicAuth(req) || req.session;
  if (!user) {
    return;
  }

  var context = {};

  if (typeof user.id === 'string' || typeof user.id === 'number') {
    context.id = user.id;
  } else if (typeof user._id === 'string' || typeof user._id === 'number') {
    context.id = user._id;
  }

  if (typeof user.username === 'string') {
    context.username = user.username;
  } else if (typeof user.name === 'string') {
    context.username = user.name;
  }

  if (typeof user.email === 'string') {
    context.email = user.email;
  }

  return context;
}

function parseUrl(urlStr) {
  return new url.URL(urlStr, 'relative:///');
}

function tryJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {}
}

module.exports = {
  getContextFromRequest,
  getContextFromResponse,
  getUserContextFromRequest,
  parseUrl,
};
