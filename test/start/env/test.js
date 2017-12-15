'use strict'

var assert = require('assert')
var agent = require('../../..')

assert.equal(agent.serviceName, 'from-env')
