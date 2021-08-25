function getMetadataAwsLambda (serviceName) {
  return {
    provider: 'aws',
    region: process.env.AWS_REGION,
    service: {
      name: serviceName
    }
  }
}

module.exports = {
  getMetadataAwsLambda
}
