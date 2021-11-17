'use strict'

var assert = require('assert')

var agent = require('../../..')

assert.strictEqual(agent._conf.serviceName, 'from-file')
