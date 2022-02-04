class ElasticOtelSpan {
  constructor (span) {
    this._spanOrTransaction = span
  }

  end () {
    this._spanOrTransaction.end()
  }
}

module.exports = ElasticOtelSpan
