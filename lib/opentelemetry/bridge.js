const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

class ElasticNodeTracerProvider extends NodeTracerProvider {
}

module.exports = {
  ElasticNodeTracerProvider
}
