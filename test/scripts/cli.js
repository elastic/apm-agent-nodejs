'use strict';

var fs = require('fs');
var path = require('path');
var opbeat = require('../../');
var inquirer = require('inquirer');
var untildify = require('untildify');
var mkdirp = require('mkdirp');

var test = function (options) {
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
    { name: 'save', message: 'Save answers?', type: 'confirm' }
  ];

  inquirer.prompt(questions, function (answers) {
    if (answers.save) {
      delete answers.save;
      saveConf(answers, test.bind(null, answers));
    } else {
      // inquirer gives quite a long stack-trace, so let's do this async
      process.nextTick(test.bind(null, answers));
    }
  });
});
