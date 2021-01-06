/**
 * Test fixtures for meta data test server.
 *
 * name: allows a specific response to be loaded.
 * response: the JSON a server should respond with
 */
module.exports = {
  aws: [
    {
      name: 'default aws fixture',
      response: {
        devpayProductCodes: null,
        marketplaceProductCodes: ['1abc2defghijklm3nopqrs4tu'],
        availabilityZone: 'us-west-2b',
        privateIp: '10.158.112.84',
        version: '2017-09-30',
        instanceId: 'i-1234567890abcdef0',
        billingProducts: null,
        instanceType: 't2.micro',
        accountId: '123456789012',
        imageId: 'ami-5fb8c835',
        pendingTime: '2016-11-19T16:32:11Z',
        architecture: 'x86_64',
        kernelId: null,
        ramdiskId: null,
        region: 'us-west-2'
      }
    }
  ]
}
