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

// From v6.0.6 mongoose uses a `create` operation
const usesCreateOperation = semver.gte(mongooseVersion, '6.0.6')

// Define a schema.
const TestSchema = new mongoose.Schema({
  name: String,
  lastRun: Date
})
mongoose.model('Test', TestSchema)

test('Mongoose simple test', { skip: usesCreateOperation }, async function (t) {
  resetAgent(5, function noop () {})

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
    const haveParentTrans = data.spans.reduce((prev, s) => prev && s.parent_id === trans.id, true)
    const haveRightSubtype = data.spans.reduce((prev, s) => prev && s.subtype === 'mongodb', true)

    t.equal(trans.name, 't0', 'transaction.name')
    t.equal(data.spans.length, 4, 'num spans')
    t.ok(haveParentTrans, 'spans have parent transaction')
    t.ok(haveRightSubtype, 'spans have subtype')
    t.equal(data.spans[0].name, 'elasticapm.tests.insert', 'span.name')
    t.equal(data.spans[1].name, 'elasticapm.tests.find', 'span.name')
    // Between v5.5.10 and 5.9.2 the operation `remove` was renamed to `delete`
    const deleteNames = ['remove', 'delete']
    t.ok(deleteNames.some(name => `elasticapm.tests.${name}` === data.spans[2].name), 'span.name')
  })

  t.end()
})

test('Mongoose simple test', { skip: !usesCreateOperation }, async function (t) {
  resetAgent(6, function noop () {})

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
    const haveParentTrans = data.spans.reduce((prev, s) => prev && s.parent_id === trans.id, true)
    const haveRightSubtype = data.spans.reduce((prev, s) => prev && s.subtype === 'mongodb', true)

    t.equal(trans.name, 't0', 'transaction.name')
    t.equal(data.spans.length, 5, 'num spans')
    t.ok(haveParentTrans, 'spans have parent transaction')
    t.ok(haveRightSubtype, 'spans have subtype')
    // TODO: there is a racing condition between insert & create operations in `mongoose`???
    t.equal(data.spans[0].name, 'elasticapm.tests.create', 'span.name')
    t.equal(data.spans[1].name, 'elasticapm.tests.insert', 'span.name')
    t.equal(data.spans[2].name, 'elasticapm.tests.find', 'span.name')
    t.equal(data.spans[3].name, 'elasticapm.tests.delete', 'span.name')
  })

  t.end()
})

function resetAgent (numExpected, cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(numExpected, cb)
  agent.captureError = function (err) { throw err }
}
