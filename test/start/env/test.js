'use strict'

var assert = require('assert')
var agent = require('../../..')

assert.equal(agent._conf.serviceName, 'from-env')
