// Send a span so we can test that it has a `span.stacktrace`.

const agent = require('../../../').start({
  serviceName: 'test-send-a-span',
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
  // These tell the APM agent to always include a span stacktrace.
  captureSpanStackTraces: true,
  spanFramesMinDuration: -1,
  // These tell the agent to add source lines of context.
  sourceLinesSpanAppFrames: 5,
  sourceLinesSpanLibraryFrames: 5
})

function a (cb) {
  setImmediate(cb)
}

function main () {
  const trans = agent.startTransaction('main')
  const span = agent.startSpan('a')
  a(function () {
    span.end()
    trans.end()
  })
}

main()
