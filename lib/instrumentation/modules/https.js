'use strict'

var semver = require('semver')
var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')
var shared = require('../http-shared')

module.exports = function (https, agent, version) {
  debug('shimming https.Server.prototype.emit function')
  shimmer.wrap(https && https.Server && https.Server.prototype, 'emit', shared.instrumentRequest(agent, 'https'))

  // From Node.js v9.0.0 and onwards, https requests no longer just call the
  // http.request function. So to correctly instrument outgoing HTTPS requests
  // in all supported Node.js versions, we'll only only instrument the
  // https.request function if the Node version is v9.0.0 or above.
  //
  // This change was introduced in:
  // https://github.com/nodejs/node/commit/5118f3146643dc55e7e7bd3082d1de4d0e7d5426
  if (semver.gte(version, '9.0.0')) {
    debug('shimming https.request function')
    shimmer.wrap(https, 'request', shared.traceOutgoingRequest(agent, 'https'))
  }

  return https
}
