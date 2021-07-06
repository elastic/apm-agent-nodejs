'use strict'

var agent = require('../../..')
const tape = require('tape')

tape('from-env service name test', function (t) {
  t.equals(agent._conf.serviceName, 'from-env')
  t.end()
})
