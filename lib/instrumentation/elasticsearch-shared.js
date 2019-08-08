'use strict'

const queryRegexp = /_((search|msearch)(\/template)?|count)$/

exports.setDbContext = function (span, params) {
  if (queryRegexp.test(params.path)) {
    // The old client exposes body and query, the new client exposes body and querystring
    const statement = Array.isArray(params.body)
      ? params.body.map(JSON.stringify).join('\n')
      : stringifyQuery(params).trim()

    if (statement) {
      span.setDbContext({
        type: 'elasticsearch',
        statement
      })
    }
  }
}

function stringifyQuery (params) {
  const query = params.body || params.querystring || params.query
  return typeof query === 'string' ? query : JSON.stringify(query)
}
