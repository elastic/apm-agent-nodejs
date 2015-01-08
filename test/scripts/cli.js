'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var opbeat = require('../../');
var inquirer = require('inquirer');
var untildify = require('untildify');
var mkdirp = require('mkdirp');
var restify = require('restify');
var connect = require('connect');
var express = require('express');

var standardTest = function (client) {
  console.log('Tacking deployment...');
  client.trackDeployment(function () {
    console.log('The deploy have been tracked!');

    console.log('Capturing error...');
    client.captureError(new Error('This is an Error object'), function (err, url) {
      if (err) console.log('Something went wrong:', err.message);
      console.log('The error have been logged at:', url);

      console.log('Capturing message...');
      client.captureError('This is a string', function (err, url) {
        if (err) console.log('Something went wrong:', err.message);
        console.log('The message have been logged at:', url);

        console.log('Throwing exception...');
        throw new Error('This Error was thrown');
      });
    });
  });
};

var httpTest = function (client) {
  var server = http.createServer(function (req, res) {
    switch (req.url) {
      case '/error':
        var err = new Error('This is a request related error');
        client.captureError(err, { request: req }, function (err, url) {
          if (err) console.log('Something went wrong:', err.message);
          console.log('The error have been logged at:', url);
          res.end();
        });
        res.writeHead(500);
        break;
      case '/throw':
        throw new Error('This Error was thrown from wihtin a http server');
      default:
        res.end();
    }
  });

  server.listen(function () {
    var port = server.address().port;
    var base = 'http://localhost:' + port;
    console.log('Test server running on port', port);

    console.log('Capturing request error...');
    http.get(base+'/error', function (res) {

      console.log('Throwing http exception...');
      http.get(base+'/throw', function () {});
    });
  });
};

var restifyTest = function (client) {
  var server = restify.createServer({ name: 'foo', version: '1.0.0' });

  server.on('uncaughtException', function (req, res, route, err) {
    client.captureError(err, { request: req }, function (err, url) {
      if (err) console.log('Something went wrong:', err.message);
      console.log('The error have been logged at:', url);
      process.exit();
    });
  });

  server.get('/error', function (req, res, next) {
    var err = new Error('This is a request related error');
    client.captureError(err, { request: req }, function (err, url) {
      if (err) console.log('Something went wrong:', err.message);
      console.log('The error have been logged at:', url);
      res.end();
      next();
    });
    res.writeHead(500);
  });

  server.get('/throw', function (req, res, next) {
    throw new Error('This Error was thrown from wihtin a http server');
  });

  server.listen(function () {
    var port = server.address().port;
    var base = 'http://localhost:' + port;
    console.log('Test server running on port', port);

    var client = restify.createJsonClient({
      url: base,
      version: '~1.0'
    });

    console.log('Capturing request error...');
    client.get('/error', function (err, req, res, obj) {

      console.log('Throwing http exception...');
      client.get('/throw', function () {});
    });
  });
};

var connectTest = function (client) {
  var testsLeft = 2;
  var app = connect();
  app.use(function (req, res, next) {
    switch (req.url) {
      case '/error':
        res.writeHead(500);
        res.end();
        next(new Error('foobar'));
        break;
      case '/throw':
        throw new Error('foobar');
      default:
        res.end();
    }
  });
  app.use(client.middleware.connect());
  app.use(function (err, req, res, next) {
    if (!--testsLeft) process.exit();
  });

  var server = http.createServer(app);
  server.listen(function () {
    var port = server.address().port;
    var base = 'http://localhost:' + port;
    console.log('Test server running on port', port);
    console.log('NOTE: No Opbeat error urls will be displayed during this test!');

    console.log('Capturing request error...');
    http.get(base+'/error', function (res) {

      console.log('Throwing http exception...');
      http.get(base+'/throw', function () {});
    });
  });
};

var expressTest = function (client) {
  var testsLeft = 2;
  var app = express();

  app.use(function (req, res, next) {
    if (req.url === '/error') var err = new Error('foobar');
    next(err);
  });
  app.get('/throw', function (req, res) {
    throw new Error('foobar');
  });
  app.use(client.middleware.express());
  app.use(function (err, req, res, next) {
    if (!err) return;
    if (!res.headersSent) {
      res.writeHead(500);
      res.end();
    }
    if (!--testsLeft) process.exit();
  });

  var server = app.listen(function () {
    var port = server.address().port;
    var base = 'http://localhost:' + port;
    console.log('Test server running on port', port);
    console.log('NOTE: No Opbeat error urls will be displayed during this test!');

    console.log('Capturing request error...');
    http.get(base+'/error', function (res) {

      console.log('Throwing http exception...');
      http.get(base+'/throw', function () {});
    });
  });
};

var test = function (suite, options) {
  options.env = 'production';
  options.clientLogLevel = 'fatal';
  options.captureExceptions = false;
  var client = opbeat(options);

  client.handleUncaughtExceptions(function (err, url) {
    console.log('The uncaught exception have been logged at:', url);
    process.exit();
  });

  client.on('error', function (err) {
    console.log(err.stack);
  });

  switch (suite) {
    case 'standard': return standardTest(client);
    case 'http': return httpTest(client);
    case 'restify': return restifyTest(client);
    case 'connect': return connectTest(client);
    case 'express': return expressTest(client);
    default: console.log('Unknown test suite selected:', options.suite);
  }
};

var loadConf = function (callback) {
  var file = untildify('~/.config/opbeat.json');
  fs.exists(file, function (exists) {
    if (!exists) return callback({});
    fs.readFile(file, function (err, data) {
      if (err) throw err;
      callback(JSON.parse(data));
    });
  });
};

var saveConf = function (conf, callback) {
  var dir = untildify('~/.config');
  mkdirp(dir, '0755', function (err) {
    if (err) throw err;
    var file = path.join(dir, 'opbeat.json');
    fs.writeFile(file, JSON.stringify(conf), function (err) {
      if (err) throw err;
      console.log('Saved config:', file);
      callback();
    });
  });
};

loadConf(function (conf) {
  var questions = [
    { name: 'appId', message: 'App ID', 'default': conf.appId },
    { name: 'organizationId', message: 'Organization ID', 'default': conf.organizationId },
    { name: 'secretToken', message: 'Secret token', 'default': conf.secretToken },
    { name: 'suite', message: 'Test suite', type: 'list', choices: ['standard','http','restify','connect','express'] },
    { name: 'save', message: 'Save answers?', type: 'confirm' }
  ];

  inquirer.prompt(questions, function (answers) {
    var suite = answers.suite;
    var save = answers.save;
    delete answers.suite;
    delete answers.save;

    if (save)
      saveConf(answers, test.bind(null, suite, answers));
    else
      // inquirer gives quite a long stack-trace, so let's do this async
      process.nextTick(test.bind(null, suite, answers));
  });
});
