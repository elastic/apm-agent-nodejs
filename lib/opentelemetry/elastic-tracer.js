const ElasticOtelSpan = require('./elastic-otel-span')

class ElasticTracer {
  constructor(agent) {
    this._elasticAgent = agent
  }

  startSpan(name, options, context) {
    const span = this._elasticAgent.startSpan(name)
    const elasticOtelSpan = new ElasticOtelSpan(span)
    return elasticOtelSpan
  }

  startActiveSpan(name, options, context, fn) {
    const span = this._elasticAgent.startSpan(name)
    const elasticOtelSpan = new ElasticOtelSpan(span)
    fn.call(null, span)
  }

  setAgent(agent) {
    this._elasticAgent = agent
  }
}
module.exports = ElasticTracer
