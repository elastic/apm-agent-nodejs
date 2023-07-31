/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

var httpShared = require('../http-shared');
var shimmer = require('../shimmer');

module.exports = function (
  modExports,
  agent,
  { version, enabled, isImportMod },
) {
  if (agent._conf.instrumentIncomingHTTPRequests) {
    agent.logger.debug('shimming https.Server.prototype.emit function');
    shimmer.wrap(
      modExports && modExports.Server && modExports.Server.prototype,
      'emit',
      httpShared.instrumentRequest(agent, 'https'),
    );
  }

  if (!enabled) {
    return modExports;
  }

  // From Node.js v9.0.0 and onwards, https requests no longer just call the
  // http.request function. So to correctly instrument outgoing HTTPS requests
  // in all supported Node.js versions, we'll only only instrument the
  // https.request function if the Node version is v9.0.0 or above.
  //
  // This change was introduced in:
  // https://github.com/nodejs/node/commit/5118f3146643dc55e7e7bd3082d1de4d0e7d5426
  if (semver.lt(version, '9.0.0')) {
    // We must ensure that the `http` module is instrumented to intercept
    // `http.{request,get}` that `https.{request,get}` are using.
    require('http');
    return modExports;
  }

  agent.logger.debug('shimming https.request function');
  let wrapped = shimmer.wrap(
    modExports,
    'request',
    httpShared.traceOutgoingRequest(agent, 'https', 'request'),
  );
  if (isImportMod && wrapped) {
    // Handle `import https from 'https'`. See comment in "http.js".
    modExports.default.request = wrapped;
  }

  agent.logger.debug('shimming https.get function');
  wrapped = shimmer.wrap(
    modExports,
    'get',
    httpShared.traceOutgoingRequest(agent, 'https', 'get'),
  );
  if (isImportMod && wrapped) {
    modExports.default.get = wrapped;
  }

  return modExports;
};
