'use strict'

module.exports = function mockInstrumentation (cb) {
  return {
    add: cb
  }
}
