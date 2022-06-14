/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test the index.d.ts type file by exercising the API in TypeScript.
// `tsc` will error out of there is a type conflict.
//
// Note: This test file is the one intended to *fully* exercise the exported
// types. Any types changes should result in an update to this file.

import apm, {
  AgentConfigOptions,
  Transaction,
  Span,
  TransactionOptions,
  SpanOptions
} from '../../'
import assert from 'assert'

const agentOpts: AgentConfigOptions = {
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false
}
apm.start(agentOpts)

function started (aBool: boolean) {
  console.log(`aBool is: ${aBool}`)
}
started(apm.isStarted())

const trans = apm.currentTransaction
const span = apm.currentSpan
const traceparent = apm.currentTraceparent
if (traceparent) traceparent.split('-')
const currentTraceIds = apm.currentTraceIds
let traceId = currentTraceIds['trace.id'] || ''
traceId += '-' + (currentTraceIds['transaction.id'] === undefined
  ? currentTraceIds['transaction.id']
  : currentTraceIds['span.id'])
if (span) {
  assert('span.id' in span.ids)
  span.end()
}
if (trans) {
  assert('transaction.id' in trans.ids)
  trans.end()
}

apm.setFramework({})
apm.setFramework({ name: 'foo' })
apm.setFramework({ name: 'foo', version: 'bar' })
apm.setFramework({ version: 'bar' })
apm.setFramework({ name: 'foo', version: 'bar', overwrite: false })

apm.addPatch('foo', 'bar')
apm.addPatch(['foo'], 'bar')
apm.addPatch('foo', function (exports, agent, options) {
  agent.isStarted()
  if (options.enabled) {}
})
apm.removePatch('foo', 'bar')
apm.removePatch(['foo'], 'bar')
apm.clearPatches('foo')
apm.clearPatches(['foo'])

apm.lambda(() => {})
apm.lambda('foo', () => {})

apm.handleUncaughtExceptions()
apm.handleUncaughtExceptions((err: Error) => {
  console.error(err.stack)
  process.exit(1)
})

apm.captureError(new Error('foo'))
apm.captureError('foo')
apm.captureError({ message: 'hello %s', params: ['world'] })
apm.captureError(new Error('foo'), { tags: { foo: 'bar' } })
apm.captureError('foo', { tags: { foo: 'bar' } })
apm.captureError({ message: 'hello %s', params: ['world'] }, { tags: { foo: 'bar' } })
apm.captureError(new Error('foo'), { tags: { foo: 'bar' } }, () => {})
apm.captureError('foo', { tags: { foo: 'bar' } }, () => {})
apm.captureError({ message: 'hello %s', params: ['world'] }, { tags: { foo: 'bar' } }, () => {})
apm.captureError(new Error('foo'), () => {})
apm.captureError('foo', () => {})
apm.captureError({ message: 'hello %s', params: ['world'] }, () => {})

apm.startTransaction()
apm.startTransaction('foo')
apm.startTransaction('foo', 'type')
apm.startTransaction('foo', 'type', 'subtype')
apm.startTransaction('foo', 'type', 'subtype', 'action')
apm.startTransaction('foo', { startTime: 1 })
apm.startTransaction('foo', 'type', { startTime: 1 })
apm.startTransaction('foo', 'type', 'subtype', { startTime: 1 })
apm.startTransaction('foo', 'type', 'subtype', 'action', { startTime: 1 })
apm.startTransaction('foo', { links: [{ context: '00-12345678901234567890123456789012-1234567890123456-01' }] })

apm.setTransactionName('foo')

apm.endTransaction()

apm.startSpan()
apm.startSpan('foo')
apm.startSpan('foo', 'type')
apm.startSpan('foo', 'type', 'subtype')
apm.startSpan('foo', 'type', 'subtype', 'action')
apm.startSpan('foo', { childOf: 'baz' })
apm.startSpan('foo', 'type', { childOf: 'baz' })
apm.startSpan('foo', 'type', 'subtype', { childOf: 'baz' })
apm.startSpan('foo', 'type', 'subtype', 'action', { childOf: 'baz' })
apm.startSpan('foo', 'type', 'subtype', 'action', { startTime: 42 })
apm.startSpan('foo', 'type', 'subtype', { exitSpan: true })

apm.setLabel('foo', 'bar')
apm.setLabel('foo', 1)
apm.setLabel('foo', false)
apm.setLabel('foo', 1, false)
apm.setLabel('foo', false, false)

apm.addLabels({ s: 'bar', n: 42, b: false })
apm.addLabels({ s: 'bar', n: 42, b: false }, false)

apm.setUserContext({
  id: 'foo',
  username: 'bar',
  email: 'baz'
})

apm.setCustomContext({ foo: { bar: { baz: true } } })

function filter1 (payload: any) {
  payload.foo = 'bar'
  return payload
}
function filter2 (payload: any) {
  return false
}
function filter3 (payload: any) {}
apm.addFilter(filter1)
apm.addFilter(filter2)
apm.addFilter(filter3)
apm.addErrorFilter(filter1)
apm.addErrorFilter(filter2)
apm.addErrorFilter(filter3)
apm.addTransactionFilter(filter1)
apm.addTransactionFilter(filter2)
apm.addTransactionFilter(filter3)
apm.addSpanFilter(filter1)
apm.addSpanFilter(filter2)
apm.addSpanFilter(filter3)
apm.addMetadataFilter(filter1)
apm.addMetadataFilter(filter2)
apm.addMetadataFilter(filter3)

apm.flush()
apm.flush(() => {})

apm.destroy()

apm.logger.trace('')
apm.logger.debug('')
apm.logger.info('')
apm.logger.warn('')
apm.logger.error('')
apm.logger.fatal('')

{
  const trans = apm.startTransaction()
  if (trans) {
    trans.traceparent.split('-')

    trans.setLabel('foo', 'bar')
    trans.setLabel('foo', 42)
    trans.setLabel('foo', false)

    trans.addLabels({ s: 'bar', n: 42, b: false })

    trans.startSpan()
    trans.startSpan('foo')
    trans.startSpan('foo', 'type')
    trans.startSpan('foo', 'type', 'subtype')
    trans.startSpan('foo', 'type', 'subtype', 'action')
    trans.startSpan('foo', { childOf: 'baz' })
    trans.startSpan('foo', 'type', { childOf: 'baz' })
    trans.startSpan('foo', 'type', 'subtype', { childOf: 'baz' })
    trans.startSpan('foo', 'type', 'subtype', 'action', { childOf: 'baz' })
    trans.startSpan('foo', 'type', 'subtype', { exitSpan: true })
    trans.startSpan('foo', { links: [{ context: '00-12345678901234567890123456789012-1234567890123456-01' }] })

    function ensureParentId (id: string) {}
    ensureParentId(trans.ensureParentId())

    trans.setOutcome('failure')

    trans.end()
    trans.end('foo')
    trans.end('foo', 42)
    trans.end(null, 42)
    trans.end(undefined, 42)
  }
}

{
  const trans = apm.startTransaction()
  if (trans) {
    const span = trans.startSpan()
    if (span) {
      span.traceparent.split('-')

      span.setLabel('foo', 'bar')
      span.setLabel('foo', 42)
      span.setLabel('foo', false)

      span.addLabels({ s: 'bar', n: 42, b: false })

      span.setOutcome('failure')

      span.end()
      span.end(42)
    }
  }
}
