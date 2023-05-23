/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const ElasticAPMHttpClient = require('elastic-apm-http-client')

const test = require('tape')

const Agent = require('../../lib/agent')
const { NoopTransport } = require('../../lib/transport/noop-transport')
const { createTransport } = require('../../lib/transport/transport')

test('#createTransport - disableSend', (t) => {
  const agent = new Agent()
  const transport = createTransport({ disableSend: true }, agent)

  t.ok(transport instanceof NoopTransport, 'transport should be NoopTransport')
  agent.destroy()
  t.end()
})

test('#createTransport - contextPropagationOnly', (t) => {
  const agent = new Agent()
  const transport = createTransport({ contextPropagationOnly: true }, agent)

  t.ok(transport instanceof NoopTransport, 'transport should be a NoopTransport instance')
  agent.destroy()
  t.end()
})

test('#createTransport - customTransport', (t) => {
  const agent = new Agent()
  const customTransport = {}
  const transport = createTransport({ transport: function () { return customTransport } }, agent)

  t.ok(transport === customTransport, 'transport should be resolved from config property')
  agent.destroy()
  t.end()
})

test('#createTransport - elastic APM Transport', (t) => {
  const agent = new Agent()
  const transport = createTransport({
    serviceName: 'test-agent',
    centralConfig: false,
    cloudProvider: 'none'
  }, agent)

  t.ok(transport instanceof ElasticAPMHttpClient, 'transport should be an ElasticAPMHttpClient instance')
  agent.destroy()
  t.end()
})
