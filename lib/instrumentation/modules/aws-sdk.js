'use strict'
const semver = require('semver')
const shimmer = require('../shimmer')
const { instrumentationSqs } = require('./aws-sdk/sqs')

// Called in place of AWS.Request.send and AWS.Request.promise
//
// Determines which amazon service an API request is for
// and then passes call on to an appropriate instrumentation
// function.
function instrumentOperation (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (request.service.serviceIdentifier === 'sqs') {
    return instrumentationSqs(orig, origArguments, request, AWS, agent, { version, enabled })
  }

  // if we're still here, then we still need to call the original method
  return orig.apply(request, origArguments)
}

// main entry point for aws-sdk instrumentation
module.exports = function (AWS, agent, { version, enabled }) {
  if (!enabled) return AWS
  if (!semver.satisfies(version, '>1 <3')) {
    agent.logger.debug('aws-sdk version %s not supported - aborting...', version)
    return AWS
  }

  shimmer.wrap(AWS.Request.prototype, 'send', function (orig) {
    return function _wrappedAWSRequestSend () {
      return instrumentOperation(orig, arguments, this, AWS, agent, { version, enabled })
    }
  })

  shimmer.wrap(AWS.Request.prototype, 'promise', function (orig) {
    return function _wrappedAWSRequestPromise () {
      return instrumentOperation(orig, arguments, this, AWS, agent, { version, enabled })
    }
  })
  return AWS
}
