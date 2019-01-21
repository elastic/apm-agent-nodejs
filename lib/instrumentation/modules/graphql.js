'use strict'

var semver = require('semver')

var getPathFromRequest = require('../express-utils').getPathFromRequest

module.exports = function (graphql, agent, version, enabled) {
  if (!enabled) return graphql
  if (!semver.satisfies(version, '>=0.7.0 <15.0.0 || ^14.0.0-rc') ||
      !graphql.Kind ||
      typeof graphql.Source !== 'function' ||
      typeof graphql.parse !== 'function' ||
      typeof graphql.validate !== 'function' ||
      typeof graphql.execute !== 'function') {
    agent.logger.debug('graphql version %s not supported - aborting...', version)
    return graphql
  }

  var wrapped = {}

  Object.defineProperty(wrapped, '__esModule', {
    value: true
  })

  Object.keys(graphql).forEach(function (key) {
    var getter = graphql.__lookupGetter__(key)
    var setter = graphql.__lookupSetter__(key)
    var opts = { enumerable: true }

    if (getter) {
      switch (key) {
        case 'graphql':
          opts.get = function get () {
            return wrapGraphql(getter())
          }
          break
        case 'execute':
          opts.get = function get () {
            return wrapExecute(getter())
          }
          break
        default:
          opts.get = getter
      }
    }

    if (setter) {
      opts.set = setter
    }

    Object.defineProperty(wrapped, key, opts)
  })

  return wrapped

  function wrapGraphql (orig) {
    return function wrappedGraphql (schema, requestString, rootValue, contextValue, variableValues, operationName) {
      var trans = agent._instrumentation.currentTransaction
      var span = agent.buildSpan()
      var id = span && span.transaction.id
      var spanName = 'GraphQL: Unkown Query'
      agent.logger.debug('intercepted call to graphql.graphql %o', { id: id })

      // As of now, the only reason why there might be a transaction but no
      // span is if the transaction have ended. But just to be sure this
      // doesn't break in the future we add the extra `!span` guard as well
      if (!trans || trans.ended || !span) {
        agent.logger.debug('no active transaction found - skipping graphql tracing')
        return orig.apply(this, arguments)
      }

      var source = new graphql.Source(requestString || '', 'GraphQL request')
      if (source) {
        var documentAST

        try {
          documentAST = graphql.parse(source)
        } catch (syntaxError) {
          agent.logger.debug('graphql.parse(source) failed - skipping graphql query extraction')
        }

        if (documentAST) {
          var validationErrors = graphql.validate(schema, documentAST)
          if (validationErrors && validationErrors.length === 0) {
            var queries = extractDetails(documentAST, operationName).queries
            if (queries.length > 0) spanName = 'GraphQL: ' + queries.join(', ')
          }
        }
      } else {
        agent.logger.debug('graphql.Source(query) failed - skipping graphql query extraction')
      }

      span.start(spanName, 'db.graphql.execute')
      var p = orig.apply(this, arguments)
      p.then(function () {
        span.end()
      })
      return p
    }
  }

  function wrapExecute (orig) {
    function wrappedExecuteImpl (schema, document, rootValue, contextValue, variableValues, operationName) {
      var trans = agent._instrumentation.currentTransaction
      var span = agent.buildSpan()
      var id = span && span.transaction.id
      var spanName = 'GraphQL: Unkown Query'
      agent.logger.debug('intercepted call to graphql.execute %o', { id: id })

      // As of now, the only reason why there might be a transaction but no
      // span is if the transaction have ended. But just to be sure this
      // doesn't break in the future we add the extra `!span` guard as well
      if (!trans || trans.ended || !span) {
        agent.logger.debug('no active transaction found - skipping graphql tracing')
        return orig.apply(this, arguments)
      }

      var details = extractDetails(document, operationName)
      var queries = details.queries
      operationName = operationName || (details.operation && details.operation.name && details.operation.name.value)
      if (queries.length > 0) spanName = 'GraphQL: ' + (operationName ? operationName + ' ' : '') + queries.join(', ')

      if (trans._graphqlRoute) {
        var name = queries.length > 0 ? queries.join(', ') : 'Unknown GraphQL query'
        if (trans.req) var path = getPathFromRequest(trans.req)
        var defaultName = name
        defaultName = path ? defaultName + ' (' + path + ')' : defaultName
        defaultName = operationName ? operationName + ' ' + defaultName : defaultName
        trans.setDefaultName(defaultName)
      }

      span.start(spanName, 'db.graphql.execute')
      var p = orig.apply(this, arguments)
      if (typeof p.then === 'function') {
        p.then(function () {
          span.end()
        })
      } else {
        span.end()
      }
      return p
    }

    return function wrappedExecute (argsOrSchema, document, rootValue, contextValue, variableValues, operationName) {
      return arguments.length === 1
        ? wrappedExecuteImpl(
          argsOrSchema.schema,
          argsOrSchema.document,
          argsOrSchema.rootValue,
          argsOrSchema.contextValue,
          argsOrSchema.variableValues,
          argsOrSchema.operationName
        )
        : wrappedExecuteImpl(
          argsOrSchema,
          document,
          rootValue,
          contextValue,
          variableValues,
          operationName
        )
    }
  }

  function extractDetails (document, operationName) {
    var queries = []
    var operation

    if (document && Array.isArray(document.definitions)) {
      document.definitions.some(function (definition) {
        if (!definition || definition.kind !== graphql.Kind.OPERATION_DEFINITION) return
        if (!operationName && operation) return
        if (!operationName || (definition.name && definition.name.value === operationName)) {
          operation = definition
          return true
        }
      })

      var selections = operation && operation.selectionSet && operation.selectionSet.selections
      if (selections && Array.isArray(selections)) {
        selections.forEach(function (selection) {
          var kind = selection.name && selection.name.kind
          if (kind === graphql.Kind.NAME) {
            var queryName = selection.name.value
            if (queryName) queries.push(queryName)
          }
        })

        queries = queries.sort(function (a, b) {
          if (a > b) return 1
          else if (a < b) return -1
          return 0
        })
      }
    } else {
      agent.logger.debug('unexpected document format - skipping graphql query extraction')
    }

    return { queries: queries, operation: operation }
  }
}
