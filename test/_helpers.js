'use strict'

var _oldConsoleInfo = console.info
var _oldConsoleWarn = console.warn
var _oldConsoleError = console.error

exports.mockLogger = function () {
  console.info = function () { console.info._called = true }
  console.warn = function () { console.warn._called = true }
  console.error = function () { console.error._called = true }
  console.info._called = false
  console.warn._called = false
  console.error._called = false
}

exports.restoreLogger = function () {
  console.info = _oldConsoleInfo
  console.warn = _oldConsoleWarn
  console.error = _oldConsoleError
}
