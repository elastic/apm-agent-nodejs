'use strict'
const semver = require('semver')
var shimmer = require('../shimmer')
const { instrumentationSqs } = require('./aws-sdk/sqs')

// Called in place of AWS.Request.send
//
// Determines which amazon service an API request is for
// and then passes call on to an appropriate instrumentation
// function.
function instrumentOperation (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (request.service.serviceIdentifier === 'sqs') {
    return instrumentationSqs(orig, origArguments, request, AWS, agent, { version, enabled })
  }

  return null
}

// main entry point for aws-sdk instrumentation
module.exports = function (AWS, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>1 <3')) {
    agent.logger.debug('aws-sdk version %s not supported - aborting...', version)
    return AWS
  }

  shimmer.wrap(AWS.Request.prototype, 'send', function (orig) {
    return function _wrappedAWSRequestSend () {
      return instrumentOperation(orig, arguments, this, AWS, agent, { version, enabled })
    }
  })
  return AWS
}
