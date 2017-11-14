'use strict'

var semver = require('semver')
var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')
var shared = require('../http-shared')

module.exports = function (https, agent, version) {
  debug('shimming https.Server.prototype.emit function')
  shimmer.wrap(https && https.Server && https.Server.prototype, 'emit', shared.instrumentRequest(agent, 'https'))

  // From Node.js v0.11.12 until v9.0.0, https requests just uses the
  // http.request function. So to avoid creating a trace twice for the same
  // request, we'll only instrument the https.request function if the Node
  // version is less than 0.11.12 or >=9.0.0
  //
  // The was introduced in:
  // https://github.com/nodejs/node/commit/d6bbb19f1d1d6397d862d09304bc63c476f675c1
  //
  // And removed again in:
  // https://github.com/nodejs/node/commit/5118f3146643dc55e7e7bd3082d1de4d0e7d5426
  if (semver.satisfies(version, '<0.11.12 || >=9.0.0')) {
    debug('shimming https.request function')
    shimmer.wrap(https, 'request', shared.traceOutgoingRequest(agent, 'https'))
  }

  return https
}
