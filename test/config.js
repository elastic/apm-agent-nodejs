'use strict'

var os = require('os')
var util = require('util')
var test = require('tape')
var isRegExp = require('core-util-is').isRegExp
var Agent = require('./_agent')

var optionFixtures = [
  ['serviceName', 'SERVICE_NAME'],
  ['secretToken', 'SECRET_TOKEN'],
  ['serviceVersion', 'SERVICE_VERSION'],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME', os.hostname()],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', 50],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['instrument', 'INSTRUMENT', true],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['ff_captureFrame', 'FF_CAPTURE_FRAME', false]
]

var falsyValues = [false, 0, '', '0', 'false', 'no', 'off', 'disabled']
var truthyValues = [true, 1, '1', 'true', 'yes', 'on', 'enabled']

optionFixtures.forEach(function (fixture) {
  if (fixture[1]) {
    var bool = typeof fixture[2] === 'boolean'
    var number = typeof fixture[2] === 'number'

    test('should be configurable by envrionment variable ELASTIC_APM_' + fixture[1], function (t) {
      var agent = Agent()
      var value = bool ? (fixture[2] ? '0' : '1') : number ? 1 : 'custom-value'
      process.env['ELASTIC_APM_' + fixture[1]] = value
      agent.start()
      t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value)
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })

    test('should overwrite ELASTIC_APM_' + fixture[1] + ' by option property ' + fixture[0], function (t) {
      var agent = Agent()
      var opts = {}
      var value1 = bool ? (fixture[2] ? '0' : '1') : number ? 2 : 'overwriting-value'
      var value2 = bool ? (fixture[2] ? '1' : '0') : number ? 1 : 'custom-value'
      opts[fixture[0]] = value1
      process.env['ELASTIC_APM_' + fixture[1]] = value2
      agent.start(opts)
      t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value1)
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })
  }

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent._conf[fixture[0]], fixture[2])
    t.end()
  })
})

falsyValues.forEach(function (val) {
  test('should be disabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, false)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

truthyValues.forEach(function (val) {
  test('should be enabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, true)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

test('should overwrite ELASTIC_APM_ACTIVE by option property active', function (t) {
  var agent = Agent()
  var opts = { serviceName: 'foo', secretToken: 'baz', active: false }
  process.env.ELASTIC_APM_ACTIVE = '1'
  agent.start(opts)
  t.equal(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  t.end()
})

test('should default active to true if required options have been specified', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'foo', secretToken: 'baz' })
  t.equal(agent._conf.active, true)
  t.end()
})

test('should default active to false if required options have not been specified', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('should force active to false if required options have not been specified', function (t) {
  var agent = Agent()
  agent.start({ active: true })
  t.equal(agent._conf.active, false)
  t.end()
})

test('should default to empty request blacklist arrays', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.ignoreUrlStr.length, 0)
  t.equal(agent._conf.ignoreUrlRegExp.length, 0)
  t.equal(agent._conf.ignoreUserAgentStr.length, 0)
  t.equal(agent._conf.ignoreUserAgentRegExp.length, 0)
  t.end()
})

test('should separate strings and regexes into their own blacklist arrays', function (t) {
  var agent = Agent()
  agent.start({
    ignoreUrls: ['str1', /regex1/],
    ignoreUserAgents: ['str2', /regex2/]
  })

  t.deepEqual(agent._conf.ignoreUrlStr, ['str1'])
  t.deepEqual(agent._conf.ignoreUserAgentStr, ['str2'])

  t.equal(agent._conf.ignoreUrlRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUrlRegExp[0]))
  t.equal(agent._conf.ignoreUrlRegExp[0].toString(), '/regex1/')

  t.equal(agent._conf.ignoreUserAgentRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUserAgentRegExp[0]))
  t.equal(agent._conf.ignoreUserAgentRegExp[0].toString(), '/regex2/')

  t.end()
})

test('missing serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('invalid serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start({serviceName: 'foo&bar'})
  t.equal(agent._conf.active, false)
  t.end()
})

test('valid serviceName => active', function (t) {
  var agent = Agent()
  agent.start({serviceName: 'fooBAR0123456789_- '})
  t.equal(agent._conf.active, true)
  t.end()
})
