'use strict'

const apiCompatibilityChecks = require('opentracing/lib/test/api_compatibility').default
const Tracer = require('../..')

const agent = require('../../..').start()
apiCompatibilityChecks(() => new Tracer(agent), { skipBaggageChecks: true, skipInjectExtractChecks: true })
