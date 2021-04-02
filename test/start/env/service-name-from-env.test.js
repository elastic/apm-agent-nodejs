'use strict'

var test = require('tap').test

process.env.ELASTIC_APM_SERVICE_NAME = 'from-env'
var agent = require('../../..')

test('pick up serviceName from ELASTIC_APM_SERVICE_NAME envvar', t => {
  t.equal(agent._conf.serviceName, 'from-env')
  t.end()
})
