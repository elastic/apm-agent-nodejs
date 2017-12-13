'use strict'

var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')

module.exports = function (handlebars, agent, version) {
  debug('shimming handlebars.compile')
  shimmer.wrap(handlebars, 'compile', wrapCompile)

  return handlebars

  function wrapTemplate (original) {
    return function wrappedTemplate (data) {
      var trace = agent.buildTrace()
      var id = trace && trace.transaction.id

      debug('intercepted call to handlebars render %o', {
        id: id,
        data: data
      })

      if (trace) trace.start('handlebars', 'template.handlebars.render')
      var ret = original.apply(this, arguments)
      if (trace) trace.end()

      return ret
    }
  }

  function wrapCompile (original) {
    return function wrappedCompile (input) {
      var trace = agent.buildTrace()
      var id = trace && trace.transaction.id

      debug('intercepted call to handlebars compile %o', {
        id: id,
        input: input
      })

      if (trace) trace.start('handlebars', 'template.handlebars.compile')
      var ret = original.apply(this, arguments)
      if (trace) trace.end()

      return wrapTemplate(ret)
    }
  }
}
