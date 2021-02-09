var agent = require('..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})
const constants = require('../lib/constants')

const noOpClient = {
  _write () {},
  sendSpan () {},
  sendTransaction () {},
  sendError () {},
  sendMetricSet () {},
  flush () {}
}
agent._transport = noOpClient

const test = require('tape')

test('span outcome tests', function (test) {
  test.test('span starts unknown, ends with success', function (t) {
    // test that
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'spans without errors')
    t.end()
  })

  test.test('span starts unknown, and ends unknowns if it\'s not ended', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'span that does not end has unknown outcome')
    t.end()
  })

  test.test('span starts unknown, and ends with failure if error captured', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    agent.captureError(new Error('this is an error'))
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.FAILURE, 'if an error is captured, current span\'s outcome is failure')
    t.end()
  })

  test.test('test that external span\'s value is a success if not explicatly set', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    span.setType('external')
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'external spans don\'t change on end')
    t.end()
  })

  test.end()
})

test('API span.setOutcome tests', function (test) {
  test.test('API set value will be honored over non-API value', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.FAILURE)
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.FAILURE, 'respects API set value')
    t.end()
  })

  test.test('API set value wil be honored over non-API with error', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.SUCCESS)
    agent.captureError(new Error('this is an error'))
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'respects API set value, ignore error')
    t.end()
  })

  test.test('API set value of unknown will override normal success', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.UNKNOWN)
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'respects API set value')
    t.end()
  })

  test.end()
})

test('API span.setOutcome tests', function (test) {
  test.test('API set value will be honored over non-API value', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.FAILURE)
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.FAILURE, 'respects API set value')
    t.end()
  })

  test.test('API set value wil be honored over non-API with error', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.SUCCESS)
    agent.captureError(new Error('this is an error'))
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'respects API set value, ignore error')
    t.end()
  })

  test.test('set value of unknown will override normal success', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.setOutcome(constants.SPAN.OUTCOME.UNKNOWN)
    span.end()
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'respects API set value')
    t.end()
  })

  test.test('API calls ignored after a span has ended', function (t) {
    agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = agent.startSpan()
    t.equals(span.outcome, constants.SPAN.OUTCOME.UNKNOWN, 'spans start with unknown outcome')
    span.end()
    span.setOutcome(constants.SPAN.OUTCOME.UNKNOWN)
    agent.endTransaction()
    t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'does not set outcome after span has ended')
    t.end()
  })

  test.end()
})

test('API transaction.setOutcome tests', function (test) {
  test.test('transaction defaults to unknown', function (t) {
    const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
    agent.endTransaction()
    t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.UNKNOWN, 'make it')
    t.end()
  })

  test.test('transaction status code >= 500 is a failure', function (t) {
    const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
    transaction._setOutcomeFromStatusCode(500)
    agent.endTransaction()
    t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.FAILURE, '500 is an error')
    t.end()
  })

  test.test('transaction status code < 400 is a success', function (t) {
    const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
    transaction._setOutcomeFromStatusCode(499)
    agent.endTransaction()
    t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.SUCCESS, '499 is a success')
    t.end()
  })

  test.test('transaction public API setOutcome "wins" over internal APIs', function (t) {
    const transactionSuccess = agent.startTransaction('foo', 'type', 'subtype', 'action')
    transactionSuccess.setOutcome(constants.TRANSACTION.OUTCOME.SUCCESS)
    transactionSuccess._setOutcomeFromStatusCode(500)
    agent.endTransaction()
    t.equals(transactionSuccess.outcome, constants.TRANSACTION.OUTCOME.SUCCESS, 'agent uses setOutcome status')

    const transactionFailure = agent.startTransaction('foo', 'type', 'subtype', 'action')
    transactionFailure.setOutcome(constants.TRANSACTION.OUTCOME.FAILURE)
    transactionFailure._setOutcomeFromStatusCode(200)
    agent.endTransaction()
    t.equals(transactionFailure.outcome, constants.TRANSACTION.OUTCOME.FAILURE, 'agent uses setOutcome status')

    const transactionUnknown = agent.startTransaction('foo', 'type', 'subtype', 'action')
    transactionUnknown.setOutcome(constants.TRANSACTION.OUTCOME.UNKNOWN)
    transactionUnknown._setOutcomeFromStatusCode(200)
    agent.endTransaction()
    t.equals(transactionUnknown.outcome, constants.TRANSACTION.OUTCOME.UNKNOWN, 'agent uses setOutcome status')

    test.test('outcome not set after transaction ends', function (t) {
      const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
      transaction._setOutcomeFromStatusCode(200)
      agent.endTransaction()
      t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.SUCCESS, 'success')
      transaction.setOutcome(constants.TRANSACTION.OUTCOME.FAILURE)
      t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.SUCCESS, 'still success')
      t.end()
    })

    t.end()
  })
  test.end()
})

test('agent level setTransactionOutcome tests', function (test) {
  test.test('outcome set', function (t) {
    const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
    agent.setTransactionOutcome(constants.TRANSACTION.OUTCOME.SUCCESS)
    agent.endTransaction()
    t.equals(transaction.outcome, constants.TRANSACTION.OUTCOME.SUCCESS, 'outcome set to success')
    t.end()
  })
  test.end()
})

test('agent level setSpanOutcome tests', function (test) {
  test.test('outcome set', function (t) {
    const transaction = agent.startTransaction('foo', 'type', 'subtype', 'action')
    const span = transaction.startSpan()
    const childSpan = transaction.startSpan()

    // invoke an async context to work around
    // https://github.com/elastic/apm-agent-nodejs/issues/1889
    setTimeout(function () {
      agent.setSpanOutcome(constants.SPAN.OUTCOME.FAILURE)
      childSpan.end()
      span.end()
      agent.endTransaction()
      t.equals(childSpan.outcome, constants.SPAN.OUTCOME.FAILURE, 'outcome set to failure')
      t.equals(span.outcome, constants.SPAN.OUTCOME.SUCCESS, 'outcome set to success, not effected by agent.setSpanOutcome call')
      t.end()
    }, 1)
  })
  test.end()
})
