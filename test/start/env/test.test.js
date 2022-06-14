/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var agent = require('../../..').start({
  disableSend: true
})
const tape = require('tape')

tape('from-env service name test', function (t) {
  t.equals(agent._conf.serviceName, 'from-env')
  t.end()
})
