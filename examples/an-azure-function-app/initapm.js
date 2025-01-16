require('elastic-apm-node').start({
  // XXX splain
  traceContinuationStrategy: 'restart_external'
  // ...
})
