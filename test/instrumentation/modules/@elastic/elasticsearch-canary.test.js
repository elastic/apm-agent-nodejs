/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

process.env.ELASTIC_APM_TEST_ESCLIENT_PACKAGE_NAME = '@elastic/elasticsearch-canary'
require('./elasticsearch.test.js')
