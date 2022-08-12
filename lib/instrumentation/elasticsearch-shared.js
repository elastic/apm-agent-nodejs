/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Shared functionality between the instrumentations of:
// - elasticsearch - the legacy Elasticsearch JS client
// - @elastic/elasticsearch - the new Elasticsearch JS client

function shouldCaptureBody (path, elasticsearchCaptureBodyUrlsRegExp) {
  if (!path) {
    return false
  }
  for (var i = 0; i < elasticsearchCaptureBodyUrlsRegExp.length; i++) {
    const re = elasticsearchCaptureBodyUrlsRegExp[i]
    if (re.test(path)) {
      return true
    }
  }
  return false
}

// Set the span's `context.db` from the Elasticsearch request querystring and
// body, if the request path looks like it is a query API.
//
// XXX link to the spec section
// XXX perhaps drop "set" side-effect, and pass back the context
//
// `path` and `body` can both be null or undefined.
exports.setElasticsearchDbContext = function (span, path, body, elasticsearchCaptureBodyUrlsRegExp) {
  const dbContext = {
    type: 'elasticsearch'
  }

  if (body && shouldCaptureBody(path, elasticsearchCaptureBodyUrlsRegExp)) {
    let dbStatement
    if (typeof (body) === 'string') {
      dbStatement = body
    } else if (Buffer.isBuffer(body) || typeof body.pipe === 'function') {
      // Never serialize a Buffer or a Readable. These guards mirror
      // `shouldSerialize()` in the ES client, e.g.:
      // https://github.com/elastic/elastic-transport-js/blob/069172506d1fcd544b23747d8c2d497bab053038/src/Transport.ts#L614-L618
    } else if (Array.isArray(body)) {
      try {
        dbStatement = body.map(JSON.stringify).join('\n') + '\n' // ndjson
      } catch (_ignoredErr) {}
    } else if (typeof (body) === 'object') {
      try {
        dbStatement = JSON.stringify(body)
      } catch (_ignoredErr) {}
    }
    if (dbStatement) {
      dbContext.statement = dbStatement
    }
  }

  span.setDbContext(dbContext)
}
