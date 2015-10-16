'use strict'

if (!process.addAsyncListener) require('async-listener')

var state = module.exports = {}
var noop = function () {}

process.addAsyncListener({
  create: asyncFunctionInitialized,
  before: asyncCallbackBefore,
  error: noop,
  after: noop
})

function asyncFunctionInitialized () {
  return {
    req: state.req,
    trans: state.trans,
    lastTransactionTraceStarted: state.lastTransactionTraceStarted
  }
}

function asyncCallbackBefore (context, data) {
  if (data.req) state.req = data.req
  if (data.trans) state.req = data.trans
  if (data.lastTransactionTraceStarted) state.lastTransactionTraceStarted = data.lastTransactionTraceStarted
}
