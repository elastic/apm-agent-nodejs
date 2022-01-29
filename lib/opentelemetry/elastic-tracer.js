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
    // console.log(api.trace.getSpanContext(context))

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
    fn.call(null, span)
  }

  setAgent(agent) {
    this._elasticAgent = agent
  }
}
module.exports = ElasticTracer
