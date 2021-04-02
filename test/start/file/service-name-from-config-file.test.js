'use strict'

// Using a local "elastic-apm-node.js" file for agent config relies on the
// CWD being that dir.
process.chdir(__dirname)

var test = require('tap').test

var agent = require('../../..')

test('pick up serviceName from ./elastic-apm-node.js file', t => {
  t.equal(agent._conf.serviceName, 'from-file')
  t.end()
})
