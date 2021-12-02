#!/usr/bin/env node

// A small example showing Elastic APM tracing the 'handlebars' package.

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-handlebars'
})

const handlebars = require('handlebars')

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1')

var template = handlebars.compile('Hello, {{name}}!')
console.log(template({ name: 'world' }))
console.log(template({ name: 'Bob' }))

t1.end()
