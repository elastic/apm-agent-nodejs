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

const agent = require('../../..').start({
  serviceName: 'test-mongoose',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false
})

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
  resetAgent(5, function (data) {
    console.log(data)
    t.equal(data.transactions[0].name, 't0', 'transaction.name')
    t.equal(data.spans.length, 4)
    t.equal(data.spans[0].name, 'elasticapm.tests.insert', 'span.name')
    t.equal(data.spans[0].subtype, 'mongodb', 'span.subtype')
    t.equal(data.spans[0].parent_id, data.transactions[0].id, 'span.parent_id')
    t.equal(data.spans[1].name, 'elasticapm.tests.find', 'span.name')
    t.equal(data.spans[1].subtype, 'mongodb', 'span.subtype')
    t.equal(data.spans[1].parent_id, data.transactions[0].id, 'span.parent_id')
    t.equal(data.spans[2].name, 'elasticapm.tests.delete', 'span.name')
    t.equal(data.spans[2].subtype, 'mongodb', 'span.subtype')
    t.equal(data.spans[2].parent_id, data.transactions[0].id, 'span.parent_id')
    t.end()
  })

  const TestModel = mongoose.model('Test')
  const t1 = agent.startTransaction('t0')

  await mongoose.connect(url)
  await TestModel.create({ name: 'mongoose-test', lastRun: new Date() })
  await TestModel.find({})
  await TestModel.deleteMany()
  await mongoose.disconnect()

  t1.end()
})

function resetAgent (numExpected, cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(numExpected, cb)
  agent.captureError = function (err) { throw err }
}
