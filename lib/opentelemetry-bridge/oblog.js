'use strict'

// XXX splain, used for *most* OTel API calls, e.g. haven't bothered on some lesser used ones like `OTelSpan.updateName()`

module.exports = {
  setApiCallLogFn (logFn) {
    module.exports.apicall = logFn
  },

  apicall () {}
}
