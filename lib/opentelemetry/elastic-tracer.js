const api = require('@opentelemetry/api')
const ElasticOtelSpan = require('./elastic-otel-span')

function shouldStartTransaction(tracer, options, context) {
  return !tracer._elasticAgent.currentTransaction
}

class ElasticTracer {
  constructor(agent) {
    this._elasticAgent = agent
  }

  startSpan(name, options, context) {
    // if an explicit runContext is set, we need to act as the parentContext
    if(context) {
      this._elasticAgent._instrumentation._runCtxMgr.supersedeRunContext(context)
    }

    let spanOrTransaction
    if(shouldStartTransaction(this, options, context)) {
      spanOrTransaction = this._elasticAgent.startTransaction(name, null, {})
    } else {
      spanOrTransaction = this._elasticAgent.startSpan(name)
    }

    const elasticOtelSpan = new ElasticOtelSpan(spanOrTransaction)

    return elasticOtelSpan
  }

  startActiveSpan(name, options, context, fn) {
    const span = this.startSpan(name, options, context)
    const currentContext = this._elasticAgent._instrumentation._runCtxMgr.active()
    return this._elasticAgent._instrumentation._runCtxMgr.with(
      currentContext, fn, undefined, span
    )
  }

  setAgent(agent) {
    this._elasticAgent = agent
  }
}
module.exports = ElasticTracer
