'use strict'

exports.wrapCompile = function (agent, moduleName) {
  function wrapTemplate (original) {
    return function wrappedTemplate (data) {
      var spanType = 'template.' + moduleName + '.render'
      var span = agent.startSpan(moduleName, spanType)
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to %s render %o', moduleName, {
        id: id,
        data: data
      })

      var ret = original.apply(this, arguments)
      if (span) span.end()

      return ret
    }
  }

  return function wrappedCompile (original) {
    return function wrappedCompile (input) {
      var spanType = 'template.' + moduleName + '.compile'

      var span = agent.startSpan(moduleName, spanType)
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to %s compile %o', moduleName, {
        id: id,
        input: input
      })

      var ret = original.apply(this, arguments)
      if (span) span.end()

      return typeof ret === 'function' ? wrapTemplate(ret) : ret
    }
  }
}
