'use strict'

// Based on https://github.com/othiym23/shimmer/blob/master/index.js

var logger = require('debug')('opbeat')

exports.wrap = wrap
exports.massWrap = massWrap
exports.unwrap = unwrap

function isFunction (funktion) {
  return funktion && {}.toString.call(funktion) === '[object Function]'
}

function wrap (nodule, name, wrapper) {
  if (!nodule || !nodule[name]) {
    logger('no original function ' + name + ' to wrap')
    return
  }

  if (!wrapper) {
    logger('no wrapper function')
    logger((new Error()).stack)
    return
  }

  if (!isFunction(nodule[name]) || !isFunction(wrapper)) {
    logger('original object and wrapper must be functions')
    return
  }

  if (nodule[name].__obWrapped) {
    logger('function ' + name + ' already wrapped')
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
    logger('must provide one or more modules to patch')
    logger((new Error()).stack)
    return
  } else if (!Array.isArray(nodules)) {
    nodules = [nodules]
  }

  if (!(names && Array.isArray(names))) {
    logger('must provide one or more functions to wrap on modules')
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
    logger('no function to unwrap.')
    logger((new Error()).stack)
    return
  }

  if (!nodule[name].__obUnwrap) {
    logger('no original to unwrap to -- has ' + name + ' already been unwrapped?')
  } else {
    return nodule[name].__obUnwrap()
  }
}
