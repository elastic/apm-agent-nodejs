'use strict'

var agent = require('../../..')

const tape = require('tape')

tape('from-file serviceName test', function (t) {
  t.equals(agent._conf.serviceName, 'from-file')
  t.end()
})
