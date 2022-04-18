'use strict'

// XXX splain

module.exports = {
  setApiCallLogFn (logFn) {
    module.exports.apicall = logFn
  },

  apicall () {}
}
