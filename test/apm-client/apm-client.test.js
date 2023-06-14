/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const ElasticAPMHttpClient = require('elastic-apm-http-client')

const test = require('tape')

const Agent = require('../../lib/agent')
const { NoopApmClient } = require('../../lib/apm-client/noop-apm-client')
const { createApmClient } = require('../../lib/apm-client/apm-client')

test('#createApmClient - disableSend', (t) => {
  const agent = new Agent()
  const transport = createApmClient({ disableSend: true }, agent)

  t.ok(transport instanceof NoopApmClient, 'transport should be NoopApmClient')
  agent.destroy()
  t.end()
})

test('#createApmClient - contextPropagationOnly', (t) => {
  const agent = new Agent()
  const transport = createApmClient({ contextPropagationOnly: true }, agent)

  t.ok(transport instanceof NoopApmClient, 'transport should be a NoopApmClient instance')
  agent.destroy()
  t.end()
})

test('#createApmClient - customClient', (t) => {
  const agent = new Agent()
  const customClient = {}
  const transport = createApmClient({ transport: function () { return customClient } }, agent)

  t.ok(transport === customClient, 'transport should be resolved from config property')
  agent.destroy()
  t.end()
})

test('#createApmClient - elastic APM Transport', (t) => {
  const agent = new Agent()
  const transport = createApmClient({
    serviceName: 'test-agent',
    centralConfig: false,
    cloudProvider: 'none'
  }, agent)

  t.ok(transport instanceof ElasticAPMHttpClient, 'transport should be an ElasticAPMHttpClient instance')
  agent.destroy()
  t.end()
})
