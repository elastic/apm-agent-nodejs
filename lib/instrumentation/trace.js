'use strict'

var afterAll = require('after-all-results')
var debug = require('debug')('elastic-apm')
var Timer = require('./timer')
var stackman = require('../stackman')
var parsers = require('../parsers')

module.exports = Trace

function Trace (transaction) {
  this.transaction = transaction
  this.started = false
  this.truncated = false
  this.ended = false
  this.name = null
  this.type = null
  this._db = null
  this._timer = null
  this._stackObj = null
  this._agent = transaction._agent

  debug('init trace %o', {id: this.transaction.id})
}

Trace.prototype.start = function (name, type) {
  if (this.started) {
    debug('tried to call trace.start() on already started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this.started = true
  this.name = name || this.name || 'unnamed'
  this.type = type || this.type || 'custom'

  if (!this._stackObj) this._recordStackTrace()

  this._timer = new Timer()

  debug('start trace %o', {id: this.transaction.id, name: name, type: type})
}

Trace.prototype.customStackTrace = function (stackObj) {
  debug('applying custom stack trace to trace %o', {id: this.transaction.id})
  this._recordStackTrace(stackObj)
}

Trace.prototype.truncate = function () {
  if (!this.started) {
    debug('tried to truncate non-started trace - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to truncate already ended trace - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }
  this.truncated = true
  this.end()
}

Trace.prototype.end = function () {
  if (!this.started) {
    debug('tried to call trace.end() on un-started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to call trace.end() on already ended trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this._timer.end()
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  debug('ended trace %o', {id: this.transaction.id, name: this.name, type: this.type, truncated: this.truncated})
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call trace.duration() on un-ended trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.duration()
}

Trace.prototype.offsetTime = function () {
  if (!this.started) {
    debug('tried to call trace.offsetTime() for un-started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.offset(this.transaction._timer)
}

Trace.prototype.setDbContext = function (context) {
  if (!context) return
  this._db = Object.assign(this._db || {}, context)
}

Trace.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, Trace.prototype.start)
  }
  this._stackObj = obj
}

Trace.prototype._encode = function (cb) {
  var self = this

  if (!this.started) return cb(new Error('cannot encode un-started trace'))
  if (!this.ended) return cb(new Error('cannot encode un-ended trace'))

  if (this._agent._conf.captureTraceStackTraces) {
    // TODO: This is expensive! Consider if there's a way to cache some of this
    stackman.callsites(this._stackObj, function (err, callsites) {
      if (!callsites) {
        debug('could not capture stack trace for trace %o', {id: self.transaction.id, name: self.name, type: self.type, err: err && err.message})
        done()
        return
      }

      if (!process.env.ELASTIC_APM_TEST) callsites = callsites.filter(filterCallsite)

      var next = afterAll(done)

      callsites.forEach(function (callsite) {
        parsers.parseCallsite(callsite, self._agent, next())
      })
    })
  } else {
    process.nextTick(done)
  }

  function done (err, frames) {
    if (err) return cb(err)

    var payload = {
      name: self.name,
      type: self.truncated ? self.type + '.truncated' : self.type,
      start: self.offsetTime(),
      duration: self.duration()
    }

    if (frames) payload.stacktrace = frames
    if (self._db) payload.context = {db: self._db}

    cb(null, payload)
  }
}

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
