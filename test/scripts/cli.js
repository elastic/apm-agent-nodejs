'use strict';

var opbeat = require('../../');
var inquirer = require('inquirer');

var questions = [
  { name: 'app_id', message: 'App ID' },
  { name: 'organization_id', message: 'Organization ID' },
  { name: 'secret_token', message: 'Secret token' }
];

var test = function (options) {
  options.env = 'production';
  options.level = 'fatal';
  options.handleExceptions = false;
  var client = opbeat.createClient(options);

  client.handleUncaughtExceptions(function (err) {
    console.log('Handled uncaught exception correctly');
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
