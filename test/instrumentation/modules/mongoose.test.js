/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const { NoopApmClient } = require('../../../lib/apm-client/noop-apm-client')

const agent = require('../../..').start({
  serviceName: 'test-mongoose',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false,
  transport: function () {
    return new NoopApmClient()
  }
})

const { promisify } = require('util')
const semver = require('semver')
const test = require('tape')

const mongooseVersion = require('mongoose/package.json').version

const isMongodbIncompat = require('../../_is_mongodb_incompat')()
if (semver.gte(mongooseVersion, '5.7.0') && isMongodbIncompat) {
  console.log(`# SKIP mongoose ${mongooseVersion}. Mongodb incompat ${isMongodbIncompat}`)
  process.exit(0)
}

if (
  (semver.gte(mongooseVersion, '7.0.0') && semver.lt(process.version, '14.20.1')) ||
  (semver.gte(mongooseVersion, '6.0.0') && semver.lt(process.version, '12.0.0')) ||
  (semver.gte(mongooseVersion, '5.0.0') && semver.lt(process.version, '4.0.0'))
) {
  console.log(`# SKIP mongoose ${mongooseVersion} not compatible with ${process.version}`)
  process.exit(0)
}

const mongoose = require('mongoose')

const mockClient = require('../../_mock_http_client')

const host = process.env.MONGODB_HOST || 'localhost'
const url = `mongodb://${host}:27017/elasticapm`

// Define a schema.
const TestSchema = new mongoose.Schema({
  name: String,
  lastRun: Date
})
mongoose.model('Test', TestSchema)

test('Mongoose simple test', async function (t) {
  resetAgent(function noop () {})

  const TestModel = mongoose.model('Test')

  const trans = agent.startTransaction('t0')
  await mongoose.connect(url)
  await TestModel.create({ name: 'mongoose-test', lastRun: new Date() })
  await TestModel.find({})
  await TestModel.deleteMany()
  await mongoose.disconnect()
  trans.end()

  await promisify(agent.flush.bind(agent))().then(function (err) {
    t.error(err, 'no error from agent.flush()')
    const data = agent._apmClient._writes
    const trans = data.transactions[0]
    const spans = data.spans
    const parentTransOk = spans.reduce((prev, s) => prev && s.parent_id === trans.id, true)
    const subtypeOk = spans.reduce((prev, s) => prev && s.subtype === 'mongodb', true)

    t.equal(trans.name, 't0', 'transaction.name')
    t.ok(parentTransOk, 'spans parent_id')
    t.ok(subtypeOk, 'spans subtype')
    // v5 sends : insert, find, delete
    // v5.4.0 added a new command to end sessions:  insert, find, delete, admin.$cmd.command
    // on v6 a new command `create` appears:  create, insert, find, delete, admin.$cmd.command
    t.ok(spanExists(spans, 'elasticapm.tests.insert'), 'insert span present')
    t.ok(spanExists(spans, 'elasticapm.tests.find'), 'find span present')
    // Between v5.5.10 and 5.9.2 the operation `remove` was renamed to `delete`
    t.ok(
      spanExists(spans, 'elasticapm.tests.remove') || spanExists(spans, 'elasticapm.tests.delete'),
      'delete span present'
    )
  })

  t.end()
})

function spanExists (spans, name) {
  return spans.findIndex(s => s.name === name) !== -1
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
