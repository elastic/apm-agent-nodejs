// Test the Agent's .d.ts type files by exercising the API in TypeScript:
// tsc will error out of there is a type conflict.

import agent, { AgentConfigOptions, Transaction, Span, TransactionOptions, SpanOptions } from '../../'

const agentOpts: AgentConfigOptions = {
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false
}
agent.start(agentOpts)

function started (aBool: boolean) {
  console.log(`aBool is: ${aBool}`)
}
started(agent.isStarted())

const trans = agent.currentTransaction
if (trans) trans.end()
const span = agent.currentSpan
if (span) span.end()
const traceparent = agent.currentTraceparent
if (traceparent) traceparent.split('-')
const currentTraceIds = agent.currentTraceIds
let traceId = currentTraceIds['trace.id'] || ''
traceId += '-' + (currentTraceIds['transaction.id'] === undefined
  ? currentTraceIds['transaction.id']
  : currentTraceIds['span.id'])

agent.setFramework({})
agent.setFramework({ name: 'foo' })
agent.setFramework({ name: 'foo', version: 'bar' })
agent.setFramework({ version: 'bar' })
agent.setFramework({ name: 'foo', version: 'bar', overwrite: false })

agent.addPatch('foo', 'bar')
agent.addPatch(['foo'], 'bar')
agent.addPatch('foo', function (exports, agent, options) {
  agent.isStarted()
  if (options.enabled) {}
})
agent.removePatch('foo', 'bar')
agent.removePatch(['foo'], 'bar')
agent.clearPatches('foo')
agent.clearPatches(['foo'])

agent.lambda(() => {})
agent.lambda('foo', () => {})

agent.handleUncaughtExceptions()
agent.handleUncaughtExceptions((err: Error) => {
  console.error(err.stack)
  process.exit(1)
})

agent.captureError(new Error('foo'))
agent.captureError('foo')
agent.captureError({ message: 'hello %s', params: ['world'] })
agent.captureError(new Error('foo'), { tags: { foo: 'bar' } })
agent.captureError('foo', { tags: { foo: 'bar' } })
agent.captureError({ message: 'hello %s', params: ['world'] }, { tags: { foo: 'bar' } })
agent.captureError(new Error('foo'), { tags: { foo: 'bar' } }, () => {})
agent.captureError('foo', { tags: { foo: 'bar' } }, () => {})
agent.captureError({ message: 'hello %s', params: ['world'] }, { tags: { foo: 'bar' } }, () => {})
agent.captureError(new Error('foo'), () => {})
agent.captureError('foo', () => {})
agent.captureError({ message: 'hello %s', params: ['world'] }, () => {})

agent.startTransaction()
agent.startTransaction('foo')
agent.startTransaction('foo', 'type')
agent.startTransaction('foo', 'type', 'subtype')
agent.startTransaction('foo', 'type', 'subtype', 'action')
agent.startTransaction('foo', { startTime: 1 })
agent.startTransaction('foo', 'type', { startTime: 1 })
agent.startTransaction('foo', 'type', 'subtype', { startTime: 1 })
agent.startTransaction('foo', 'type', 'subtype', 'action', { startTime: 1 })

agent.setTransactionName('foo')

agent.endTransaction()

agent.startSpan()
agent.startSpan('foo')
agent.startSpan('foo', 'type')
agent.startSpan('foo', 'type', 'subtype')
agent.startSpan('foo', 'type', 'subtype', 'action')
agent.startSpan('foo', { childOf: 'baz' })
agent.startSpan('foo', 'type', { childOf: 'baz' })
agent.startSpan('foo', 'type', 'subtype', { childOf: 'baz' })
agent.startSpan('foo', 'type', 'subtype', 'action', { childOf: 'baz' })

agent.setLabel('foo', 'bar')
agent.setLabel('foo', 1)
agent.setLabel('foo', false)
agent.setLabel('foo', 1, false)
agent.setLabel('foo', false, false)

agent.addLabels({ s: 'bar', n: 42, b: false })
agent.addLabels({ s: 'bar', n: 42, b: false }, false)

agent.setUserContext({
  id: 'foo',
  username: 'bar',
  email: 'baz'
})

agent.setCustomContext({ foo: { bar: { baz: true } } })

function filter1 (payload: any) {
  payload.foo = 'bar'
  return payload
}
function filter2 (payload: any) {
  return false
}
function filter3 (payload: any) {}
agent.addFilter(filter1)
agent.addFilter(filter2)
agent.addFilter(filter3)
agent.addErrorFilter(filter1)
agent.addErrorFilter(filter2)
agent.addErrorFilter(filter3)
agent.addTransactionFilter(filter1)
agent.addTransactionFilter(filter2)
agent.addTransactionFilter(filter3)
agent.addSpanFilter(filter1)
agent.addSpanFilter(filter2)
agent.addSpanFilter(filter3)
agent.addMetadataFilter(filter1)
agent.addMetadataFilter(filter2)
agent.addMetadataFilter(filter3)

agent.flush()
agent.flush(() => {})

agent.destroy()

agent.logger.trace('')
agent.logger.debug('')
agent.logger.info('')
agent.logger.warn('')
agent.logger.error('')
agent.logger.fatal('')

{
  const trans = agent.startTransaction()
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

    function ensureParentId (id: string) {}
    ensureParentId(trans.ensureParentId())

    trans.end()
    trans.end('foo')
    trans.end('foo', 42)
    trans.end(null, 42)
    trans.end(undefined, 42)
  }
}

{
  const trans = agent.startTransaction()
  if (trans) {
    const span = trans.startSpan()
    if (span) {
      span.traceparent.split('-')

      span.setLabel('foo', 'bar')
      span.setLabel('foo', 42)
      span.setLabel('foo', false)

      span.addLabels({ s: 'bar', n: 42, b: false })

      span.end()
      span.end(42)
    }
  }
}
