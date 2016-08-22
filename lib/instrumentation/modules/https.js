'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')
var shared = require('../http-shared')

module.exports = function (https, agent, version) {
  debug('shimming https.Server.prototype.emit function')
  shimmer.wrap(https && https.Server && https.Server.prototype, 'emit', shared.instrumentRequest(agent, 'https'))

  // From Node v0.11.12 and onwards, https requests just uses the http.request
  // function. So to avoid creating a trace twice for the same request, we'll
  // only instrument the https.request function if the Node version is less
  // than 0.11.12
  //
  // The change was introduced in:
  // https://github.com/nodejs/node/commit/d6bbb19f1d1d6397d862d09304bc63c476f675c1
  if (semver.lt(version, '0.11.12')) {
    debug('shimming https.request function')
    shimmer.wrap(https, 'request', shared.traceOutgoingRequest(agent, 'https'))
  }

  return https
}
