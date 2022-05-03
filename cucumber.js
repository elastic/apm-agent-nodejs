// https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md
module.exports = {
  default: {
    paths: [
      // We don't support all of the gherkin specs from apm.git, so list each
      // one individually.
      'test/cucumber/gherkin-specs/otel_bridge.feature'
    ],
    require: ['test/cucumber/*.js'],
    publishQuiet: true,
    backtrace: true, // Enable this to see stacktraces into cucumber library code.
    // `parallel > 1` should be fine, but avoid it for now to avoid
    // multi-process execution of tests. Linear should be more debuggable.
    parallel: 1
  }
}
