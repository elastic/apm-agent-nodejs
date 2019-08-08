'use strict'

const queryRegexp = /_((search|msearch)(\/template)?|count)$/

exports.setDbContext = function (span, params) {
  if (queryRegexp.test(params.path)) {
    // The old client exposes body and query, the new client exposes body and querystring
    const statement = Array.isArray(params.body)
      ? params.body.map(JSON.stringify).join('\n')
      : JSON.stringify(params.body || params.querystring || params.query)

    if (statement) {
      span.setDbContext({
        type: 'elasticsearch',
        statement
      })
    }
  }
}
