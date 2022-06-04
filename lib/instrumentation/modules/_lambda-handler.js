'use strict'
const { getLambdaHandlerInfo } = require('../../lambda')
const Instrumentation = require('../index')

// XXX from esbuild. Add to NOTICE.
var __defProp = Object.defineProperty
var __getOwnPropDesc = Object.getOwnPropertyDescriptor
var __hasOwnProp = Object.prototype.hasOwnProperty
var __getOwnPropNames = Object.getOwnPropertyNames
// XXX check for newer __copyProps in esbuild:internal/runtime/runtime.go
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (const key of __getOwnPropNames(from)) {
      if (!__hasOwnProp.call(to, key) && key !== except) { __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable }) }
    }
  }
  return to
}

// XXX could generalize this to not be specific to `agent.lambda(...)` as wrapper
function shimmerPPWrap (agent, subpath, mod) {
  const parts = subpath.split('.')
  if (parts.length === 0) {
    return mod
  }
  const namespaces = [mod]
  let namespace = mod
  let key
  let val
  for (let i = 0; i < parts.length; i++) {
    key = parts[i]
    val = namespace[key]
    if (!val) {
      // XXX make these throw and catch for better error logging
      console.log('WARN: cannot wrap, no "<mod>.%s"', parts.slice(0, i).join('.'))
      return mod
    } else if (i < parts.length - 1) {
      // Limitation: A *function* could be a namespace holding a handler
      // function as a property. However, if that property is not writeable
      // then we cannot wrap it.
      if (typeof val !== 'object') {
        console.log('WARN: cannot wrap, "<mod>.%s" is not an object', parts.slice(0, i).join('.'))
        return mod
      }
      namespace = val
      namespaces.push(namespace)
    } else {
      // This is the last part of the subpath.
      if (typeof val !== 'function') {
        console.log('WARN: cannot wrap, "<mod>.%s" is not a function', subpath)
        return mod
      }
    }
  }
  console.log('XXX namespaces', namespaces)
  // Now work backwards, wrapping each namespace with a new object that has a
  // copy of all the properties, except the one that we've wrapped.
  for (let i = parts.length - 1; i >= 0; i--) {
    key = parts[i]
    namespace = namespaces[i]
    val = i === parts.length - 1 ? agent.lambda(namespace[key]) : namespaces[i + 1]
    const wrappedNamespace = __defProp({}, key, {
      value: val,
      enumerable: true // XXX descriptor.enumerable reuse
    })
    __copyProps(wrappedNamespace, namespace, key)
    namespaces[i] = wrappedNamespace
  }
  console.log('XXX parts', parts)
  console.log('XXX namespaces', namespaces)

  return namespaces[0]
}

module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }

  const { field } = getLambdaHandlerInfo(process.env, Instrumentation.modules, agent.logger)
  // XXX
  // wrapNestedPath(agent, field, module)
  const wrappedMod = shimmerPPWrap(agent, field, module)
  return wrappedMod
}
