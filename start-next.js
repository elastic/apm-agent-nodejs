'use strict'

// Use this module via `node --require=elastic-apm-node/start-next ...`
// monitor a Next.js app with Elastic APM.

const apm = require('./').start()

// Flush APM data on server process termination.
// https://nextjs.org/docs/deployment#manual-graceful-shutdowns
process.env.NEXT_MANUAL_SIG_HANDLE = 1
function flushApmAndExit () {
  apm.flush(() => {
    process.exit(0)
  })
}
process.on('SIGTERM', flushApmAndExit)
process.on('SIGINT', flushApmAndExit)
