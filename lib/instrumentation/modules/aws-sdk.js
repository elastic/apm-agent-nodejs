'use strict'
const semver = require('semver')
var shimmer = require('../shimmer')
const { instrumentationSqs } = require('./aws-sdk/sqs')

function instrumentOperation (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (request.service.serviceIdentifier === 'sqs') {
    return instrumentationSqs(orig, origArguments, request, AWS, agent, { version, enabled })
  }

  return null
}

module.exports = function (AWS, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>1 <3')) {
    agent.logger.debug('aws-sdk version %s not supported - aborting...', version)
    return mysql2
  }

  shimmer.wrap(AWS.Request.prototype, 'send', function (orig) {
    return function _wrappedAWSRequestSend () {
      return instrumentOperation(orig, arguments, this, AWS, agent, { version, enabled })
    }
  })
  return AWS
}
