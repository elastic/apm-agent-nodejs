'use strict'

var agent = require('../../')

var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var inquirer = require('inquirer')
var untildify = require('untildify')

var standardTest = function () {
  console.log('Capturing error...')
  agent.captureError(new Error('This is an Error object'), function (err) {
    if (err) console.log('Something went wrong:', err.message)
    console.log('The error have been logged')

    console.log('Capturing message...')
    agent.captureError('This is a string', function (err) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The message have been logged')

      console.log('Capturing parameterized message...')
      var params = {
        message: 'Timeout exeeded by %d seconds',
        params: [Math.random()]
      }
      agent.captureError(params, function (err) {
        if (err) console.log('Something went wrong:', err.message)
        console.log('The parameterized message have been logged')

        console.log('Throwing exception...')
        throw new Error('This Error was thrown')
      })
    })
  })
}

var httpTest = function () {
  var http = require('http')

  var server1 = http.createServer(function (req, res) {
    var err = new Error('This is a request related error')
    agent.captureError(err, function (err) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged')
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
        agent.captureError(err, function (err) {
          if (err) console.log('Something went wrong:', err.message)
          console.log('The error have been logged')
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
    agent.captureError(err, function (err) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged')
      process.exit()
    })
  })

  server.get('/error', function (req, res, next) {
    var err = new Error('This is a request related error')
    agent.captureError(err, function (err) {
      if (err) console.log('Something went wrong:', err.message)
      console.log('The error have been logged')
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
  app.use(agent.middleware.connect())
  app.use(function (err, req, res, next) { // eslint-disable-line handle-callback-err
    if (!--testsLeft) process.exit()
  })

  var server = http.createServer(app)
  server.listen(function () {
    var port = server.address().port
    var base = 'http://localhost:' + port
    console.log('Test server running on port', port)

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
  app.use(agent.middleware.express())
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
      console.log('Done making transactions - flushing queue...')
      agent._instrumentation._queue._flush()
      return
    }

    console.log('Starting new transaction')

    var type = Math.random() > 0.5 ? 'request' : 'my-custom-type'
    var trans = agent.startTransaction('foo', type)
    var t1 = agent.buildSpan()
    t1.start('sig1', 'foo.bar.baz1')
    var t2 = agent.buildSpan()
    t2.start('sig2', 'foo.bar.baz1')

    setTimeout(function () {
      var t3 = agent.buildSpan()
      t3.start('sig3', 'foo.bar.baz2')
      setTimeout(function () {
        var t4 = agent.buildSpan()
        t4.start('sig4', 'foo.bar.baz3')
        setTimeout(function () {
          t3.end()
          t4.end()
          t1.end()
        }, Math.random() * 100 + 50)
      }, Math.random() * 100 + 50)
    }, Math.random() * 100 + 25)

    setTimeout(function () {
      var t5 = agent.buildSpan()
      t5.start('sig5', 'foo.bar.baz2')
      setTimeout(function () {
        var t6 = agent.buildSpan()
        t6.start('sig6', 'foo.bar.baz4')
        setTimeout(function () {
          t6.end()
          t5.end()
          t2.end()
        }, Math.random() * 100 + 50)
      }, Math.random() * 100 + 50)
    }, Math.random() * 100 + 50)

    setTimeout(function () {
      trans.result = Math.round(Math.random() * 300 + 200)

      console.log('Ending transaction (name: %s, type: %s)', trans.name, trans.type)
      trans.end()
    }, 500)

    setTimeout(makeTransaction, Math.random() * 300 + 200)
  }
}

var test = function (suite, opts) {
  opts.logLevel = 'fatal'
  opts.captureExceptions = false
  agent.start(opts)

  agent.handleUncaughtExceptions(function (err) { // eslint-disable-line handle-callback-err
    console.log('The uncaught exception have been logged')
    process.exit()
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
  var file = untildify('~/.config/elastic-apm-node.json')
  fs.stat(file, function (err) {
    if (err) {
      if (err.code !== 'ENOENT') return cb(err)
      return cb(null, {})
    }
    fs.readFile(file, function (err, data) {
      if (err) return cb(err)
      cb(null, JSON.parse(data))
    })
  })
}

var saveConf = function (conf, cb) {
  var dir = untildify('~/.config')
  mkdirp(dir, '0755', function (err) {
    if (err) throw err
    var file = path.join(dir, 'elastic-apm-node.json')
    fs.writeFile(file, JSON.stringify(conf), function (err) {
      if (err) throw err
      console.log('Saved config:', file)
      cb()
    })
  })
}

loadConf(function (err, conf) {
  if (err) throw err
  var questions = [
    { name: 'serviceName', message: 'Service name', 'default': conf.serviceName },
    { name: 'secretToken', message: 'Secret token', 'default': conf.secretToken },
    { name: 'serverUrl', message: 'APM Server URL', 'default': conf.serverUrl },
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
