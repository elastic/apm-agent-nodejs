'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')

var ins = agent._instrumentation

require('./_shared-promise-tests')(test, Promise, ins)
