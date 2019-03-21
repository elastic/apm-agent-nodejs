import * as agent from '../../'

agent.start({
  captureExceptions: false,
  logLevel: 'fatal'
})

function started (bool: boolean) {}
started(agent.isStarted())

agent.lambda(() => {})
agent.lambda('foo', () => {})

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
agent.startTransaction('foo', 'bar')
agent.startTransaction('foo', 'bar', { startTime: 1 })

agent.setTransactionName('foo')

agent.endTransaction()

agent.startSpan()
agent.startSpan('foo')
agent.startSpan('foo', 'bar')
agent.startSpan('foo', 'bar', { childOf: 'baz' })

agent.setTag('foo', 'bar')
agent.setTag('foo', 1)
agent.setTag('foo', false)

agent.addTags({ s: 'bar', n: 42, b: false })

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
    trans.setTag('foo', 'bar')
    trans.setTag('foo', 42)
    trans.setTag('foo', false)

    trans.addTags({ s: 'bar', n: 42, b: false })

    trans.startSpan()
    trans.startSpan('foo')
    trans.startSpan('foo', 'bar')
    trans.startSpan('foo', 'bar', { childOf: 'baz' })

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
      span.setTag('foo', 'bar')
      span.setTag('foo', 42)
      span.setTag('foo', false)

      span.addTags({ s: 'bar', n: 42, b: false })

      span.end()
      span.end(42)
    }
  }
}
