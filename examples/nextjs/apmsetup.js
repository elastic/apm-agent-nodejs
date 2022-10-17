'use strict'

// Use this script with Node's `--require` flag to monitor a Next.js app with
// Elastic APM.

// Support `ELASTIC_APM_...` envvars in ".env*" files as Next.js supports them.
// https://nextjs.org/docs/basic-features/environment-variables
try {
  const { loadEnvConfig } = require('@next/env')
  const isDev = process.argv[process.argv.length - 1] === 'dev'
  loadEnvConfig(__dirname, isDev)
} catch (envErr) {
  console.error('apmsetup: warning: failed to load @next/env to read possible .env files')
}

if (!process.env.ELASTIC_APM_SERVER_URL) {
  console.log('apmsetup: ELASTIC_APM_SERVER_URL is not set, disabling APM')
} else {
  // APM agent configuration can be passed to `.start()` or specified as
  // environment variables.
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuration.html
  const apm = require('elastic-apm-node').start()

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
}
