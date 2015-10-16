'use strict'

var shimmer = require('shimmer')

var SERVER_FNS = ['insert', 'update', 'remove', 'cursor', 'auth']
var CURSOR_FNS_FIRST = ['kill', 'next'] // TODO: what is kill used for - do we need to wrap it?

module.exports = function (mongodb, client) {
  if (mongodb.Server) {
    client.logger.trace('shimming mongodb-core.Server.prototype.command')
    shimmer.wrap(mongodb.Server.prototype, 'command', wrapCommand)
    client.logger.trace('shimming mongodb-core.Server.prototype functions:', SERVER_FNS)
    shimmer.massWrap(mongodb.Server.prototype, SERVER_FNS, function (orig, name) {
      return wrapQuery(orig, name)
    })
  }

  if (mongodb.Cursor) {
    client.logger.trace('shimming mongodb-core.Cursor.prototype functions:', CURSOR_FNS_FIRST)
    shimmer.massWrap(mongodb.Cursor.prototype, CURSOR_FNS_FIRST, function (orig, name) {
      return wrapCursor(orig, name)
    })
  }

  return mongodb

  function wrapCommand (orig) {
    return function wrappedFunction (ns, cmd) {
      var trans = client.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      client.logger.trace('[%s] intercepted call to mongodb-core.Server.prototype.command (transaction: %sactive, ns: %s)', uuid, trans ? '' : 'in', ns)

      if (trans) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          var type
          if (cmd.findAndModify) type = 'findAndModify'
          else if (cmd.createIndexes) type = 'createIndexes'
          else if (cmd.ismaster) type = 'ismaster'
          else type = 'command'

          arguments[index] = wrappedCallback
          var trace = trans.startTrace(ns + '.' + type, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        client.logger.trace('[%s] intercepted mongodb-core.Server.prototype.command callback', uuid)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }

  function wrapQuery (orig, name) {
    return function wrappedFunction (ns) {
      var trans = client.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      client.logger.trace('[%s] intercepted call to mongodb-core.Server.prototype.%s (transaction: %sactive, ns: %s)', uuid, name, trans ? '' : 'in', ns)

      if (trans) {
        var index = arguments.length - 1
        var cb = arguments[index]
        if (typeof cb === 'function') {
          arguments[index] = wrappedCallback
          var trace = trans.startTrace(ns + '.' + name, 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        client.logger.trace('[%s] intercepted mongodb-core.Server.prototype.%s callback', uuid, name)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }

  function wrapCursor (orig, name) {
    return function wrappedFunction () {
      var trans = client.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      client.logger.trace('[%s] intercepted call to mongodb-core.Cursor.prototype.%s (transaction: %sactive)', uuid, name, trans ? '' : 'in')

      if (trans) {
        var cb = arguments[0]
        if (typeof cb === 'function') {
          arguments[0] = wrappedCallback
          var trace = trans.startTrace(this.ns + '.' + (name === 'next' && this.cmd.find ? 'find' : name), 'db.mongodb.query')
        }
      }

      return orig.apply(this, arguments)

      function wrappedCallback () {
        client.logger.trace('[%s] intercepted mongodb-core.Cursor.prototype.%s callback', uuid, name)
        trace.end()
        return cb.apply(null, arguments)
      }
    }
  }
}
