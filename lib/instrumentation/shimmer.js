'use strict'

/**
 * This file is extracted from the 'shimmer' project copyright by Forrest L
 * Norvell. It have been modified slightly to be used in the current context.
 *
 * https://github.com/othiym23/shimmer
 *
 * Original file:
 *
 * https://github.com/othiym23/shimmer/blob/master/index.js
 *
 * License:
 *
 * BSD-2-Clause, http://opensource.org/licenses/BSD-2-Clause
 */

var debug = require('debug')('opbeat')

exports.wrap = wrap
exports.massWrap = massWrap
exports.unwrap = unwrap

function isFunction (funktion) {
  return funktion && {}.toString.call(funktion) === '[object Function]'
}

function wrap (nodule, name, wrapper) {
  if (!nodule || !nodule[name]) {
    debug('no original function %s to wrap', name)
    return
  }

  if (!wrapper) {
    debug('no wrapper function')
    debug((new Error()).stack)
    return
  }

  if (!isFunction(nodule[name]) || !isFunction(wrapper)) {
    debug('original object and wrapper must be functions')
    return
  }

  if (nodule[name].__obWrapped) {
    debug('function %s already wrapped', name)
    return
  }

  var original = nodule[name]
  var wrapped = wrapper(original, name)

  wrapped.__obWrapped = true
  wrapped.__obUnwrap = function __obUnwrap () {
    if (nodule[name] === wrapped) {
      nodule[name] = original
      wrapped.__obWrapped = false
    }
  }

  nodule[name] = wrapped

  return wrapped
}

function massWrap (nodules, names, wrapper) {
  if (!nodules) {
    debug('must provide one or more modules to patch')
    debug((new Error()).stack)
    return
  } else if (!Array.isArray(nodules)) {
    nodules = [nodules]
  }

  if (!(names && Array.isArray(names))) {
    debug('must provide one or more functions to wrap on modules')
    return
  }

  nodules.forEach(function (nodule) {
    names.forEach(function (name) {
      wrap(nodule, name, wrapper)
    })
  })
}

function unwrap (nodule, name) {
  if (!nodule || !nodule[name]) {
    debug('no function to unwrap.')
    debug((new Error()).stack)
    return
  }

  if (!nodule[name].__obUnwrap) {
    debug('no original to unwrap to -- has %s already been unwrapped?', name)
  } else {
    return nodule[name].__obUnwrap()
  }
}
