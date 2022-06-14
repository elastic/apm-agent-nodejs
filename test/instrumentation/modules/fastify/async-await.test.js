'use strict'

require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const isFastifyIncompat = require('../../../_is_fastify_incompat')()
if (isFastifyIncompat) {
  console.log(`# SKIP ${isFastifyIncompat}`)
  process.exit()
}

require('./_async-await')
