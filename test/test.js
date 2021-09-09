'use strict'

var path = require('path')
var readdir = require('fs').readdir
var spawn = require('child_process').spawn

var semver = require('semver')

var join = path.join

var bin = join(process.cwd(), 'node_modules/.bin')
var PATH = process.env.PATH + ':' + bin

function run (test, cb) {
  test.env = Object.assign({}, process.env, test.env || {})
  test.env.PATH = PATH

  var args = [test.file]
  if (semver.gte(process.version, '12.0.0')) {
    args.unshift('--unhandled-rejections=strict')
  } else {
    args.unshift('--require', path.join(__dirname, '_promise_rejection.js'))
  }

  console.log('running (cwd: ./%s): node %s', test.cwd || '', args.join(' '))

  var ps = spawn('node', args, {
    stdio: 'inherit',
    cwd: test.cwd,
    env: test.env
  })

  ps.on('error', cb)
  ps.on('close', function (code) {
    if (code !== 0) {
      const err = new Error('non-zero error code')
      err.code = 'ENONZERO'
      err.exitCode = code
      return cb(err)
    }
    cb()
  })
}

function series (tasks, cb) {
  var results = []
  var pos = 0

  function done (err, result) {
    if (err) return cb(err)
    results.push(result)

    if (++pos === tasks.length) {
      cb(null, results)
    } else {
      tasks[pos](done)
    }
  }

  setImmediate(tasks[pos], done)
}

function handlerBind (handler) {
  return function (task) {
    return handler.bind(null, task)
  }
}

function mapSeries (tasks, handler, cb) {
  series(tasks.map(handlerBind(handler)), cb)
}

var directories = [
  'test',
  'test/cloud-metadata',
  'test/instrumentation',
  'test/instrumentation/modules',
  'test/instrumentation/modules/@elastic',
  'test/instrumentation/modules/bluebird',
  'test/instrumentation/modules/cassandra-driver',
  'test/instrumentation/modules/express',
  'test/instrumentation/modules/fastify',
  'test/instrumentation/modules/hapi',
  'test/instrumentation/modules/http',
  'test/instrumentation/modules/koa',
  'test/instrumentation/modules/koa-router',
  'test/instrumentation/modules/mysql',
  'test/instrumentation/modules/mysql2',
  'test/instrumentation/modules/pg',
  'test/instrumentation/modules/restify',
  'test/instrumentation/modules/aws-sdk',
  'test/integration',
  'test/integration/api-schema',
  'test/lambda',
  'test/metrics',
  'test/redact-secrets',
  'test/sanitize-field-names',
  'test/sourcemaps',
  'test/stacktraces',
  'test/uncaught-exceptions'
]

mapSeries(directories, readdir, function (err, directoryFiles) {
  if (err) throw err

  var tests = [
    {
      file: 'test.test.js',
      cwd: 'test/start/env',
      env: {
        ELASTIC_APM_SERVICE_NAME: 'from-env'
      }
    },
    {
      file: 'test.test.js',
      cwd: 'test/start/file'
    }
  ]

  directoryFiles.forEach(function (files, i) {
    var directory = directories[i]
    files.forEach(function (file) {
      if (!file.endsWith('.test.js')) return

      // XXX the remaining failing tests
      if (directory === 'test/instrumentation' && file === 'index.test.js') return
      if (directory === 'test/instrumentation' && file === 'transaction.test.js') return
      if (directory === 'test/instrumentation/modules' && file === 'http2.test.js') return
      if (directory === 'test/instrumentation/modules/aws-sdk' && file === 'sqs.test.js') return

      tests.push({
        file: join(directory, file)
      })
    })
  })

  mapSeries(tests, run, function (err) {
    if (err) throw err
  })
})
