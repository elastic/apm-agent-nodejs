'use strict'
var shimmer = require('../shimmer')
const instrumentationSqs = require('./aws-sdk/sqs')

function instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled}) {
  if('sqs' === request.service.serviceIdentifier) {
    return instrumentationSqs(orig, origArguments, request, AWS, agent, {version, enabled})
  }

  return null
}

module.exports = function (AWS, agent, { version, enabled }) {
  shimmer.wrap(AWS.Request.prototype, 'send', function (orig) {
    return function _wrappedAWSRequestSend () {
      return instrumentOperation(orig, arguments, this, AWS, agent, {version, enabled})
    }
  })
  return AWS
}
