'use strict';

var opbeat = require('../../');
var inquirer = require('inquirer');

var questions = [
  { name: 'appId', message: 'App ID' },
  { name: 'organizationId', message: 'Organization ID' },
  { name: 'secretToken', message: 'Secret token' }
];

var test = function (options) {
  options.env = 'production';
  options.level = 'fatal';
  options.captureExceptions = false;
  var client = opbeat(options);

  client.handleUncaughtExceptions(function (err, url) {
    console.log('The uncaught exception have been logged at:', url);
    process.exit();
  });

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
};

inquirer.prompt(questions, function (answers) {
  // inquirer gives quite a long stack-trace, so let's do this async
  process.nextTick(test.bind(null, answers));
});
