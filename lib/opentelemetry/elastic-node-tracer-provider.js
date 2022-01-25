const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base')
const ElasticTracer = require('./elastic-tracer')

class ElasticNodeTracerProvider extends BasicTracerProvider {
  constructor(config = {}) {
    super(config);
    this._elasticAgent = null
  }

  setAgent(agent) {
    this._elasticAgent = agent
  }

  getTracer(name, version) {
    const key = `${name}@${version || ''}`;
    if (!this._tracers.has(key)) {
        const tracer = new ElasticTracer(this._elasticAgent)
        this._tracers.set(
          key,
          tracer
        );
    }
    return this._tracers.get(key);
  }
}

module.exports = ElasticNodeTracerProvider
