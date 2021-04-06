// An agent-using script that requires the given file. Used to test source-map
// handling.

var apm = require('../../..').start({
  serviceName: 'call-export-from-given-import',
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  logLevel: 'off',
  logUncaughtExceptions: true
})

const toRequire = process.argv[2]
if (!toRequire) {
  throw new Error('missing TO-REQUIRE arg')
}

console.log('started')
apm.captureError(require(toRequire)())
console.log('finished')
