'use strict'

// Run all "test/**/*.test.js" files, each in a separate process.
//
// If the `-o DIR` option is provided, then the TAP output from each test file
// will be written to "$DIR/*.tap".

var fs = require('fs')
var path = require('path')
var readdir = require('fs').readdir
var spawn = require('child_process').spawn

var dashdash = require('dashdash')
var semver = require('semver')

var bin = path.join(process.cwd(), 'node_modules/.bin')
var PATH = process.env.PATH + ':' + bin

function slugifyPath (f) {
  const illegalChars = /[^\w.-]/g
  return f.replace(illegalChars, '-')
}

// Run a single test file.  If `outDir` is set, then the TAP output will be
// written to a "$outDir/*.tap" file.
function run (test, cb) {
  test.env = Object.assign({}, process.env, test.env || {})
  test.env.PATH = PATH

  var args = [test.file]
  if (semver.gte(process.version, '12.0.0')) {
    args.unshift('--unhandled-rejections=strict')
  } else {
    args.unshift('--require', path.join(__dirname, '_promise_rejection.js'))
  }

  if (test.outDir) {
    const outFileName = path.join(test.outDir, slugifyPath(path.join(test.cwd, test.file)) + '.tap')
    console.log(`running test: cd ${test.cwd} && node ${args.join(' ')} > ${outFileName} 2&>1`)
    const outFile = fs.createWriteStream(outFileName)
    outFile.on('open', function () {
      var ps = spawn('node', args, {
        stdio: ['inherit', outFile, outFile],
        cwd: test.cwd,
        env: test.env
      })
      ps.on('error', cb)
      ps.on('close', function (code) {
        outFile.close(function onClose (closeErr) {
          if (closeErr) {
            cb(closeErr)
            return
          }

          // Dump the TAP content to stdout so it is in CI logs for debugging.
          process.stdout.write('\n' + fs.readFileSync(outFileName) + '\n')

          if (code !== 0) {
            const err = new Error('non-zero error code')
            err.code = 'ENONZERO'
            err.exitCode = code
            cb(err)
          } else {
            cb()
          }
        })
      })
    })
  } else {
    console.log(`running test: cd ${test.cwd} && node ${args.join(' ')}`)
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

// ---- mainline

var options = [
  {
    names: ['help', 'h'],
    type: 'bool',
    help: 'Print this help and exit.'
  },
  {
    names: ['output-dir', 'o'],
    type: 'string',
    help: 'Directory to which to write .tap files. By default test ' +
      'output is written to stdout/stderr',
    helpArg: 'DIR'
  }
]

var parser = dashdash.createParser({ options: options })
try {
  var opts = parser.parse(process.argv)
} catch (e) {
  console.error('test/test.js: error: %s', e.message)
  process.exit(1)
}

// Use `parser.help()` for formatted options help.
if (opts.help) {
  var help = parser.help().trimRight()
  console.log('usage: node test/test.js [OPTIONS]\n' +
              'options:\n' +
              help)
  process.exit(0)
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
  'test/instrumentation/run-context',
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
      },
      outDir: opts.output_dir
    },
    {
      file: 'test.test.js',
      cwd: 'test/start/file',
      outDir: opts.output_dir
    }
  ]

  directoryFiles.forEach(function (files, i) {
    var directory = directories[i]
    files.forEach(function (file) {
      if (!file.endsWith('.test.js')) return

      tests.push({
        file: path.join(directory, file),
        cwd: '.',
        outDir: opts.output_dir
      })
    })
  })

  mapSeries(tests, run, function (err) {
    if (err) throw err
  })
})
