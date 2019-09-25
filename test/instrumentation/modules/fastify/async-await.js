'use strict'

require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

require('./_async-await')
