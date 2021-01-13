'use strict'
const { createTestServer } = require('./_lib')
const tape = require('tape')
const request = require('request')

tape.test('test the test server: valid', function (t) {
  const serverAws = createTestServer('aws', 'default aws fixture')
  t.ok(serverAws, 'created test aws metadata server')

  t.end()
})

tape.test('test the test server: unknown provider', function (t) {
  t.throws(function () {
    createTestServer('awss', 'default aws fixture')
  })
  t.throws(function () {
    createTestServer('aws', 'default awss fixture')
  })
  t.end()
})

tape.test('basic metadata request: aws', function (t) {
  const serverAws = createTestServer('aws', 'default aws fixture')
  const listener = serverAws.listen(0, function () {
    const url = `http://127.0.0.1:${listener.address().port}/latest/dynamic/instance-identity/document`
    request(url, function (error, response, rawBody) {
      if (error) {
        throw error
      }
      const body = JSON.parse(rawBody)
      t.ok(body.version, 'version set')
      listener.close()
      t.end()
    })
  })
})
