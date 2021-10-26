'use strict'

process.env.ELASTIC_APM_TEST_ESCLIENT_PACKAGE_NAME = '@elastic/elasticsearch-canary'
require('./elasticsearch.test.js')
