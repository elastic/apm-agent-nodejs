/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

require('./_async-await')
