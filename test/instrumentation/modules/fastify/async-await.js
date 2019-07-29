'use strict'

require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

// Only Node.js v7.6.0+ supports async/await without a flag
if (require('semver').lt(process.version, '7.6.0')) process.exit()

require('./_async-await')
