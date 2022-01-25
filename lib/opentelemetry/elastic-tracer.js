const api = require('@opentelemetry/api')
const ElasticOtelSpan = require('./elastic-otel-span')

class ElasticTracer {
  constructor(agent) {
    this._elasticAgent = agent
  }

  startSpan(name, options, context) {
    console.log(api.trace.getSpanContext(context))
    const span = this._elasticAgent.startSpan(name)
    const elasticOtelSpan = new ElasticOtelSpan(span)
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
