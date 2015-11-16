'use strict'

var shimmer = require('shimmer')
var logger = require('../../logger')

var SERVER_FNS = ['insert', 'update', 'remove', 'cursor', 'auth']
var CURSOR_FNS_FIRST = ['kill', 'next'] // TODO: what is kill used for - do we need to wrap it?

module.exports = function (mongodb, agent) {
  if (mongodb.Server) {
    logger.trace('shimming mongodb-core.Server.prototype.command')
    shimmer.wrap(mongodb.Server.prototype, 'command', wrapCommand)
    logger.trace('shimming mongodb-core.Server.prototype functions:', SERVER_FNS)
    shimmer.massWrap(mongodb.Server.prototype, SERVER_FNS, wrapQuery)
  }

  if (mongodb.Cursor) {
    logger.trace('shimming mongodb-core.Cursor.prototype functions:', CURSOR_FNS_FIRST)
    shimmer.massWrap(mongodb.Cursor.prototype, CURSOR_FNS_FIRST, wrapCursor)
  }

  return mongodb

  function wrapCommand (orig) {
    return function wrappedFunction (ns, cmd) {
      var trace = agent.buildTrace()
      var uuid = trace ? trace.transaction._uuid : 'n/a'

      logger.trace('[%s] intercepted call to mongodb-core.Server.prototype.command (transaction: %s, ns: %s)', uuid, trace ? 'exists' : 'missing', ns)

      if (trace) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          var type
          if (cmd.findAndModify) type = 'findAndModify'
          else if (cmd.createIndexes) type = 'createIndexes'
          else if (cmd.ismaster) type = 'ismaster'
          else type = 'command'

          arguments[index] = wrappedCallback
          trace.start(ns + '.' + type, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        logger.trace('[%s] intercepted mongodb-core.Server.prototype.command callback', uuid)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }

  function wrapQuery (orig, name) {
    return function wrappedFunction (ns) {
      var trace = agent.buildTrace()
      var uuid = trace ? trace.transaction._uuid : 'n/a'

      logger.trace('[%s] intercepted call to mongodb-core.Server.prototype.%s (transaction: %s, ns: %s)', uuid, name, trace ? 'exists' : 'missing', ns)

      if (trace) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          arguments[index] = wrappedCallback
          trace.start(ns + '.' + name, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        logger.trace('[%s] intercepted mongodb-core.Server.prototype.%s callback', uuid, name)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }

  function wrapCursor (orig, name) {
    return function wrappedFunction () {
      var trace = agent.buildTrace()
      var uuid = trace ? trace.transaction._uuid : 'n/a'

      logger.trace('[%s] intercepted call to mongodb-core.Cursor.prototype.%s (transaction: %s)', uuid, name, trace ? 'exists' : 'missing')

      if (trace) {
        var cb = arguments[0]
        if (typeof cb === 'function') {
          arguments[0] = wrappedCallback
          trace.start(this.ns + '.' + (name === 'next' && this.cmd.find ? 'find' : name), 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        logger.trace('[%s] intercepted mongodb-core.Cursor.prototype.%s callback', uuid, name)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }
}
