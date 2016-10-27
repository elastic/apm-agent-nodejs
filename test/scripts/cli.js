'use strict'

var opbeat = require('../../')

var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var inquirer = require('inquirer')
var untildify = require('untildify')

var standardTest = function () {
  console.log('Tracking release...')
  opbeat.trackRelease(function () {
    console.log('The release have been tracked!')

    console.log('Capturing error...')
    opbeat.captureError(new Error('This is an Error object'), function (err, url) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged at:', url)

      console.log('Capturing message...')
      opbeat.captureError('This is a string', function (err, url) {
        if (err) console.log('Something went wrong:', err.message)
        console.log('The message have been logged at:', url)

        console.log('Capturing parameterized message...')
        var params = {
          message: 'Timeout exeeded by %d seconds',
          params: [Math.random()]
        }
        opbeat.captureError(params, function (err, url) {
          if (err) console.log('Something went wrong:', err.message)
          console.log('The parameterized message have been logged at:', url)

          console.log('Throwing exception...')
          throw new Error('This Error was thrown')
        })
      })
    })
  })
}

var httpTest = function () {
  var http = require('http')

  var server1 = http.createServer(function (req, res) {
    var err = new Error('This is a request related error')
    opbeat.captureError(err, function (err, url) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged at:', url)
      res.end()

      testServer2()
    })
    res.writeHead(500)
  })

  var server2 = http.createServer()

  server2.on('request', function (req, res) {
    switch (req.url) {
      case '/error':
        var err = new Error('This is a request related error')
        opbeat.captureError(err, function (err, url) {
          if (err) console.log('Something went wrong:', err.message)
          console.log('The error have been logged at:', url)
          res.end()
        })
        res.writeHead(500)
        break
      case '/throw':
        throw new Error('This Error was thrown from wihtin a http server')
    }
  })

  testServer1()

  function testServer1 () {
    server1.listen(function () {
      var port = server1.address().port
      var base = 'http://localhost:' + port
      console.log('Test server running on port', port)

      console.log('Capturing request error...')
      http.get(base + '/error')
    })
  }

  function testServer2 () {
    server2.listen(function () {
      var port = server2.address().port
      var base = 'http://localhost:' + port
      console.log('Test server running on port', port)

      console.log('Capturing request error...')
      http.get(base + '/error', function (res) {
        console.log('Throwing http exception...')
        http.get(base + '/throw')
      })
    })
  }
}

var restifyTest = function () {
  var restify = require('restify')

  var server = restify.createServer({ name: 'foo', version: '1.0.0' })

  server.on('uncaughtException', function (req, res, route, err) {
    opbeat.captureError(err, function (err, url) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged at:', url)
      process.exit()
    })
  })

  server.get('/error', function (req, res, next) {
    var err = new Error('This is a request related error')
    opbeat.captureError(err, function (err, url) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged at:', url)
      res.end()
      next()
    })
    res.writeHead(500)
  })

  server.get('/throw', function (req, res, next) {
    throw new Error('This Error was thrown from wihtin a http server')
  })

  server.listen(function () {
    var port = server.address().port
    var base = 'http://localhost:' + port
    console.log('Test server running on port', port)

    var client = restify.createJsonClient({
      url: base,
      version: '~1.0'
    })

    console.log('Capturing request error...')
    client.get('/error', function (err, req, res, obj) { // eslint-disable-line handle-callback-err
      console.log('Throwing http exception...')
      client.get('/throw', function () {})
    })
  })
}

var connectTest = function () {
  var http = require('http')
  var connect = require('connect')

  var testsLeft = 2
  var app = connect()
  app.use(function (req, res, next) {
    switch (req.url) {
      case '/error':
        res.writeHead(500)
        res.end()
        next(new Error('foobar'))
        break
      case '/throw':
        throw new Error('foobar')
      default:
        res.end()
    }
  })
  app.use(opbeat.middleware.connect())
  app.use(function (err, req, res, next) { // eslint-disable-line handle-callback-err
    if (!--testsLeft) process.exit()
  })

  var server = http.createServer(app)
  server.listen(function () {
    var port = server.address().port
    var base = 'http://localhost:' + port
    console.log('Test server running on port', port)
    console.log('NOTE: No Opbeat error urls will be displayed during this test!')

    console.log('Capturing request error...')
    http.get(base + '/error', function (res) {
      console.log('Throwing http exception...')
      http.get(base + '/throw', function () {})
    })
  })
}

var expressTest = function () {
  var http = require('http')
  var express = require('express')

  var testsLeft = 2
  var app = express()

  app.use(function (req, res, next) {
    if (req.url === '/error') var err = new Error('foobar')
    next(err)
  })
  app.get('/throw', function (req, res) {
    throw new Error('foobar')
  })
  app.use(opbeat.middleware.express())
  app.use(function (err, req, res, next) {
    if (!err) return
    if (!res.headersSent) {
      res.writeHead(500)
      res.end()
    }
    if (!--testsLeft) process.exit()
  })

  var server = app.listen(function () {
    var port = server.address().port
    var base = 'http://localhost:' + port
    console.log('Test server running on port', port)
    console.log('NOTE: No Opbeat error urls will be displayed during this test!')

    console.log('Capturing request error...')
    http.get(base + '/error', function (res) {
      console.log('Throwing http exception...')
      http.get(base + '/throw', function () {})
    })
  })
}

var transactionTest = function () {
  console.log('Tracking transaction...')
  var maxSeconds = 65
  var start = Date.now()

  makeTransaction()

  function makeTransaction () {
    if ((Date.now() - start) / 1000 > maxSeconds) {
      console.log('Done making transactions')
      return
    }

    console.log('Starting new transaction')

    var trans = opbeat.startTransaction('foo', 'bar')
    var t1 = opbeat.buildTrace()
    t1.start('sig1', 'foo.bar.baz1')
    var t2 = opbeat.buildTrace()
    t2.start('sig2', 'foo.bar.baz1')

    setTimeout(function () {
      var t3 = opbeat.buildTrace()
      t3.start('sig3', 'foo.bar.baz2')
      setTimeout(function () {
        var t4 = opbeat.buildTrace()
        t4.start('sig4', 'foo.bar.baz3')
        setTimeout(function () {
          t3.end()
          t4.end()
          t1.end()
        }, Math.random() * 100 + 50)
      }, Math.random() * 100 + 50)
    }, Math.random() * 100 + 25)

    setTimeout(function () {
      var t5 = opbeat.buildTrace()
      t5.start('sig5', 'foo.bar.baz2')
      setTimeout(function () {
        var t6 = opbeat.buildTrace()
        t6.start('sig6', 'foo.bar.baz4')
        setTimeout(function () {
          t6.end()
          t5.end()
          t2.end()
        }, Math.random() * 100 + 50)
      }, Math.random() * 100 + 50)
    }, Math.random() * 100 + 50)

    setTimeout(function () {
      trans.result = Math.round(Math.random() * 350 + 200)
      trans.result = 204

      console.log('Ending transaction')
      trans.end()
    }, 500)

    setTimeout(makeTransaction, Math.random() * 300 + 200)
  }
}

var test = function (suite, opts) {
  opts.logLevel = 'fatal'
  opts.captureExceptions = false
  opbeat.start(opts)

  opbeat.handleUncaughtExceptions(function (err, url) { // eslint-disable-line handle-callback-err
    console.log('The uncaught exception have been logged at:', url)
    process.exit()
  })

  opbeat.on('error', function (err) {
    console.log(err.stack)
  })

  switch (suite) {
    case 'standard': return standardTest()
    case 'http': return httpTest()
    case 'restify': return restifyTest()
    case 'connect': return connectTest()
    case 'express': return expressTest()
    case 'transaction': return transactionTest()
    default: console.log('Unknown test suite selected:', suite)
  }
}

var loadConf = function (cb) {
  var file = untildify('~/.config/opbeat.json')
  fs.exists(file, function (exists) {
    if (!exists) return cb({})
    fs.readFile(file, function (err, data) {
      if (err) throw err
      cb(JSON.parse(data))
    })
  })
}

var saveConf = function (conf, cb) {
  var dir = untildify('~/.config')
  mkdirp(dir, '0755', function (err) {
    if (err) throw err
    var file = path.join(dir, 'opbeat.json')
    fs.writeFile(file, JSON.stringify(conf), function (err) {
      if (err) throw err
      console.log('Saved config:', file)
      cb()
    })
  })
}

loadConf(function (conf) {
  var questions = [
    { name: 'appId', message: 'App ID', 'default': conf.appId },
    { name: 'organizationId', message: 'Organization ID', 'default': conf.organizationId },
    { name: 'secretToken', message: 'Secret token', 'default': conf.secretToken },
    { name: 'suite', message: 'Test suite', type: 'list', choices: ['standard', 'http', 'restify', 'connect', 'express', 'transaction'] },
    { name: 'save', message: 'Save answers?', type: 'confirm' }
  ]

  inquirer.prompt(questions, function (answers) {
    var suite = answers.suite
    var save = answers.save
    delete answers.suite
    delete answers.save

    if (save) saveConf(answers, test.bind(null, suite, answers))
    else process.nextTick(test.bind(null, suite, answers)) // inquirer gives quite a long stack-trace, so let's do this async
  })
})
