// inject env. variables before loading agent
process.env.AWS_LAMBDA_FUNCTION_NAME = 'fixture-function-name'
const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  cloudProvider: 'auto',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const tape = require('tape')

const { isLambdaExecutionEnviornment } = require('../../lib/lambda')

tape.test('ignores cloudProvider:auto in lambda enviornment', function (t) {
  const fetcher = agent._transport._conf.cloudMetadataFetcher
  t.strictEquals(fetcher.cloudProvider, 'none', 'config set to none')

  t.strictEquals(fetcher.shouldFetchGcp(), false, 'no gcp metadata')
  t.strictEquals(fetcher.shouldFetchAws(), false, 'no aws metadata fetcher')
  t.strictEquals(fetcher.shouldFetchAzure(), false, 'no azure metadata fetcher')
  t.strictEquals(fetcher.shouldFetchAwsLambda(), true, 'yes to AWS Lambda metadata fetcher')
  t.end()
})

tape.test('isLambdaExecutionEnviornment', function (t) {
  delete process.env.AWS_LAMBDA_FUNCTION_NAME
  t.strictEquals(isLambdaExecutionEnviornment(), false, 'execution enviornment not detected')

  process.env.AWS_LAMBDA_FUNCTION_NAME = 'fixture-function-name'
  t.strictEquals(isLambdaExecutionEnviornment(), true, 'execution enviornment detected')
  t.end()
})
