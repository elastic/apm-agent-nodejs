'use strict'

var uuid = require('node-uuid')
var debug = require('debug')('opbeat')
var Trace = require('./trace')

module.exports = Transaction

function Transaction (agent, name, type, result) {
  Object.defineProperty(this, 'name', {
    configurable: true,
    enumerable: true,
    get: function () {
      // Fall back to a somewhat useful name in case no _defaultName is set.
      // This might happen if res.writeHead wasn't called.
      return this._customName ||
        this._defaultName ||
        (this.req ? this.req.method + ' unknown route (unnamed)' : 'unnamed')
    },
    set: function (name) {
      if (this.ended) {
        debug('tried to set transaction.name on already ended transaction %o', { uuid: this._uuid })
        return
      }
      debug('setting transaction name %o', { uuid: this._uuid, name: name })
      this._customName = name
    }
  })

  Object.defineProperty(this, 'result', {
    configurable: true,
    enumerable: true,
    get: function () {
      return this._result
    },
    set: function (result) {
      if (this.ended) {
        debug('tried to set transaction.result on already ended transaction %o', { uuid: this._uuid })
        return
      }
      debug('setting transaction result %o', { uuid: this._uuid, result: result })
      this._result = result
    }
  })

  this._defaultName = name || ''
  this._customName = ''
  this.type = type
  this.result = result
  this.traces = []
  this.ended = false
  this._abortTime = 0
  this._uuid = uuid.v4()
  this._agent = agent
  this._agent._instrumentation.currentTransaction = this

  debug('start transaction %o', { uuid: this._uuid, name: name, type: type, result: result })

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = new Trace(this)
  this._rootTrace.start('transaction', 'transaction')
  this._start = this._rootTrace._start
}

Transaction.prototype.duration = function () {
  return this._rootTrace.duration()
}

Transaction.prototype.setDefaultName = function (name) {
  debug('setting default transaction name: %s %o', name, { uuid: this._uuid })
  this._defaultName = name
}

Transaction.prototype.setDefaultNameFromRequest = function () {
  var req = this.req
  var path

  // Get proper route name from Express 4.x
  if (req._opbeat_static) {
    path = 'static file'
  } else if (req.route) {
    path = req.route.path || req.route.regexp && req.route.regexp.source || ''
    if (req._opbeat_mountstack) path = req._opbeat_mountstack.join('') + (path === '/' ? '' : path)
  } else if (req._opbeat_mountstack && req._opbeat_mountstack.length > 0) {
    // in the case of custom middleware that terminates the request
    // so it doesn't reach the regular router (like express-graphql),
    // the req.route will not be set, but we'll see something on the
    // mountstack and simply use that
    path = req._opbeat_mountstack.join('')
  }

  if (!path) {
    debug('could not extract route name from request %o', {
      url: req.url,
      type: typeof path,
      null: path === null, // because typeof null === 'object'
      route: !!req.route,
      regex: req.route ? !!req.route.regexp : false,
      mountstack: req._opbeat_mountstack ? req._opbeat_mountstack.length : false,
      uuid: this._uuid
    })
    path = 'unknown route'
  }

  this.setDefaultName(req.method + ' ' + path)
}

Transaction.prototype.end = function () {
  if (this.ended) {
    debug('tried to call transaction.end() on already ended transaction %o', { uuid: this._uuid })
    return
  }

  if (!this._defaultName && this.req) this.setDefaultNameFromRequest()

  this._rootTrace.end()
  this.ended = true

  var trans = this._agent._instrumentation.currentTransaction

  // These two edge-cases should normally not happen, but if the hooks into
  // Node.js doesn't work as intended it might. In that case we want to
  // gracefully handle it. That involves ignoring all traces under the given
  // transaction as they will most likely be incomplete. We still want to send
  // the transaction without any traces to Opbeat as it's still valuable data.
  if (!trans) {
    debug('WARNING: no currentTransaction found %o', { current: trans, traces: this.traces.length, uuid: this._uuid })
    this.traces = []
  } else if (trans !== this) {
    debug('WARNING: transaction is out of sync %o', { traces: this.traces.length, uuid: this._uuid, other: trans._uuid })
    this.traces = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  debug('ended transaction %o', { uuid: this._uuid, type: this.type, result: this.result, name: this.name })
}

Transaction.prototype._recordEndedTrace = function (trace) {
  if (this.ended) {
    debug('Can\'t record ended trace after parent transaction have ended - ignoring %o', { uuid: this._uuid, trace: trace.signature })
    return
  }

  this.traces.push(trace)
}
