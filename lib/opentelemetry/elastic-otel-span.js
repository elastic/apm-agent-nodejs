class ElasticOtelSpan {
  constructor(span) {
    this._span = span
  }

  end() {
    this._span.end()
  }
}

module.exports = ElasticOtelSpan
