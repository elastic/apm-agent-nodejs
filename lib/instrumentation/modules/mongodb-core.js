'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

var SERVER_FNS = ['insert', 'update', 'remove', 'auth']
var CURSOR_FNS_FIRST = ['_find', '_getmore']

module.exports = function (mongodb, agent, version) {
  if (!semver.satisfies(version, '>=1.2.7 <3.0.0')) {
    debug('mongodb-core version %s not suppoted - aborting...', version)
    return mongodb
  }

  if (mongodb.Server) {
    debug('shimming mongodb-core.Server.prototype.command')
    shimmer.wrap(mongodb.Server.prototype, 'command', wrapCommand)
    debug('shimming mongodb-core.Server.prototype functions:', SERVER_FNS)
    shimmer.massWrap(mongodb.Server.prototype, SERVER_FNS, wrapQuery)
  }

  if (mongodb.Cursor) {
    debug('shimming mongodb-core.Cursor.prototype functions:', CURSOR_FNS_FIRST)
    shimmer.massWrap(mongodb.Cursor.prototype, CURSOR_FNS_FIRST, wrapCursor)
  }

  return mongodb

  function wrapCommand (orig) {
    return function wrappedFunction (ns, cmd) {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to mongodb-core.Server.prototype.command %o', { uuid: uuid, ns: ns })

      if (trace && arguments.length > 0) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          var type
          if (cmd.findAndModify) type = 'findAndModify'
          else if (cmd.createIndexes) type = 'createIndexes'
          else if (cmd.ismaster) type = 'ismaster'
          else if (cmd.count) type = 'count'
          else type = 'command'

          arguments[index] = wrappedCallback
          trace.start(ns + '.' + type, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        debug('intercepted mongodb-core.Server.prototype.command callback %o', { uuid: uuid })
        trace.end()
        return cb.apply(this, arguments)
      }
    }
  }

  function wrapQuery (orig, name) {
    return function wrappedFunction (ns) {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to mongodb-core.Server.prototype.%s %o', name, { uuid: uuid, ns: ns })

      if (trace && arguments.length > 0) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          arguments[index] = wrappedCallback
          trace.start(ns + '.' + name, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        debug('intercepted mongodb-core.Server.prototype.%s callback %o', name, { uuid: uuid })
        trace.end()
        return cb.apply(this, arguments)
      }
    }
  }

  function wrapCursor (orig, name) {
    return function wrappedFunction () {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to mongodb-core.Cursor.prototype.%s %o', name, { uuid: uuid })

      if (trace && arguments.length > 0) {
        var cb = arguments[0]
        if (typeof cb === 'function') {
          arguments[0] = wrappedCallback
          trace.start(this.ns + '.' + (this.cmd.find ? 'find' : name), 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        debug('intercepted mongodb-core.Cursor.prototype.%s callback %o', name, { uuid: uuid })
        trace.end()
        return cb.apply(this, arguments)
      }
    }
  }
}
