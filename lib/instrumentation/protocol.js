'use stirct'

var afterAll = require('after-all-results')
var objectAssign = require('object-assign')
var debug = require('debug')('elastic-apm')
var stackman = require('../stackman')
var parsers = require('../parsers')

exports.encode = encode

function encode (transactions, cb) {
  if (transactions.length === 0) return process.nextTick(cb)

  var next = afterAll(function (err, frames) {
    if (err) return cb(err)
    cb(null, transactions.map(function (trans, index) {
      var payload = {
        id: trans.id,
        name: trans.name,
        type: trans.type,
        duration: trans.duration(),
        timestamp: new Date(trans._timer.start).toISOString(),
        result: String(trans.result),
        context: {
          user: objectAssign(
            {},
            trans.req && parsers.getUserContextFromRequest(trans.req),
            trans._user
          ),
          tags: trans._tags || {},
          custom: trans._custom || {}
        },
        spans: encodeSpans(trans.spans, frames[index])
      }

      if (trans.req) {
        payload.context.request = parsers.getContextFromRequest(trans.req, trans._agent._logBody)
      }
      if (trans.res) {
        payload.context.response = parsers.getContextFromResponse(trans.res)
      }

      return payload
    }))
  })

  if (transactions[0]._agent.captureSpanStackTraces) {
    transactions.forEach(function (trans) {
      var next2 = afterAll(next())
      trans.spans.forEach(function (span) {
        // TODO: This is expensive! Consider if there's a way to caching some of this
        spanFrames(span, trans._agent, next2())
      })
    })
  }
}

function encodeSpans (spans, frames) {
  return spans.map(function (span, index) {
    var payload = {
      name: span.name,
      type: span.truncated ? span.type + '.truncated' : span.type,
      start: span.offsetTime(),
      duration: span.duration()
    }

    if (frames) payload.stacktrace = frames[index]
    if (span._db) payload.context = {db: span._db}

    return payload
  })
}

function spanFrames (span, agent, cb) {
  if (span._stackObj.frames) {
    process.nextTick(function () {
      cb(null, span._stackObj.frames)
    })
    return
  }

  stackman.callsites(span._stackObj.err, function (err, callsites) {
    if (!callsites) {
      debug('could not capture stack trace for span %o', {id: span.transaction.id, name: span.name, type: span.type, err: err && err.message})
      cb()
      return
    }

    if (!process.env.ELASTIC_APM_TEST) callsites = callsites.filter(filterCallsite)

    var next = afterAll(function (_, frames) {
      // As of now, parseCallsite suppresses errors internally, but even if
      // they were passed on, we would want to suppress them here anyway
      span._stackObj.frames = frames
      cb(null, frames)
    })

    callsites.forEach(function (callsite) {
      parsers.parseCallsite(callsite, agent, next())
    })
  })
}

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
