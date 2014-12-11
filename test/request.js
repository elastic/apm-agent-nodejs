'use strict';

var zlib = require('zlib');
var test = require('tape');
var nock = require('nock');
var helpers = require('./_helpers');
var opbeat = require('../');
var request = require('../lib/request');

var options = {
  organizationId: 'some-org-id',
  appId: 'some-app-id',
  secretToken: 'secret',
  captureExceptions: false
};

test('#error()', function (t) {
  t.test('without callback and successful request', function (t) {
    zlib.deflate('{}', function (err, buffer) {
      t.error(err);
      var client = opbeat(options);
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'));
          return 'ok';
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200);
      client.on('logged', function (url) {
        scope.done();
        t.equal(url, 'foo');
        t.end();
      });
      request.error(client, {});
    });
  });

  t.test('with callback and successful request', function (t) {
    zlib.deflate('{}', function (err, buffer) {
      t.error(err);
      var client = opbeat(options);
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'));
          return 'ok';
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200);
      request.error(client, {}, function (err, url) {
        scope.done();
        t.error(err);
        t.equal(url, 'foo');
        t.end();
      });
    });
  });

  t.test('without callback and bad request', function (t) {
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(function () { return '*'; })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500);
    client.on('error', function (err) {
      helpers.restoreLogger();
      scope.done();
      t.equal(err.message, 'Opbeat error (500): ');
      t.end();
    });
    helpers.mockLogger();
    request.error(client, {});
  });

  t.test('with callback and bad request', function (t) {
    var called = false;
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(function () { return '*'; })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500);
    client.on('error', function (err) {
      helpers.restoreLogger();
      scope.done();
      t.ok(called);
      t.equal(err.message, 'Opbeat error (500): ');
      t.end();
    });
    helpers.mockLogger();
    request.error(client, {}, function (err) {
      called = true;
      t.equal(err.message, 'Opbeat error (500): ');
    });
  });
});

test('#deployment()', function (t) {
  t.test('with callback and successful request', function (t) {
    zlib.deflate('{}', function (err, buffer) {
      t.error(err);
      var client = opbeat(options);
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'));
          return 'ok';
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', 'ok')
        .reply(200);
      request.deployment(client, {}, function (err) {
        scope.done();
        t.error(err);
        t.end();
      });
    });
  });

  t.test('without callback and bad request', function (t) {
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(function () { return '*'; })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', '*')
      .reply(500);
    client.on('error', function (err) {
      helpers.restoreLogger();
      scope.done();
      t.equal(err.message, 'Opbeat error (500): ');
      t.end();
    });
    helpers.mockLogger();
    request.deployment(client, {});
  });

  t.test('with callback and bad request', function (t) {
    var called = false;
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(function () { return '*'; })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', '*')
      .reply(500);
    client.on('error', function (err) {
      helpers.restoreLogger();
      scope.done();
      t.ok(called);
      t.equal(err.message, 'Opbeat error (500): ');
      t.end();
    });
    helpers.mockLogger();
    request.deployment(client, {}, function (err) {
      called = true;
      t.equal(err.message, 'Opbeat error (500): ');
    });
  });
});
