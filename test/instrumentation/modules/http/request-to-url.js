const tape = require('tape')
const http = require('http')
const { getUrlFromRequestAndOptions } = require('../../../../lib/instrumentation/http-shared')

// Creates a ClientRequest from options
//
// Creates and request an immediatly aborts/destroys it.
// This allows us to test with real ClientRequest objects
// and ensure their underlying properties are stable/consistant
// across versions.
//
// @param {options} options
// @return {ClientRequest}
function requestFromOptions (options) {
  const req = http.request(options)
  req.on('error', function () {})
  req.destroy()
  return req
}

// Creates a ClientRequest from url and options
//
// Same as requestFromOptions, but uses optional URL argument
//
// @param {url} string
// @param {object} options
// @return {ClientRequest}

function requestFromUrlAndOptions (url, options) {
  const req = http.request(url, options)
  req.on('error', function () {})
  req.destroy()
  return req
}

tape('getUrlFromRequestAndOptions', function (suite) {
  suite.test('host', function (t) {
    const options = {
      host: 'example.com'
    }
    const req = requestFromOptions(options)

    const url = getUrlFromRequestAndOptions(req, options)
    t.equals(url, 'http://example.com/', 'url rendered as expected')
    t.end()
  })

  suite.test('host, path', function (t) {
    const options = {
      host: 'example.com',
      path: '/foo'
    }
    const req = requestFromOptions(options)

    const url = getUrlFromRequestAndOptions(req, options)
    t.equals(url, 'http://example.com/foo', 'url rendered as expected')
    t.end()
  })

  suite.test('host, path, port, and query string', function (t) {
    const options = {
      host: 'example.com',
      path: '/foo?fpp=bar',
      port: 32
    }
    const req = requestFromOptions(options)

    const url = getUrlFromRequestAndOptions(req, options)
    t.equals(url, 'http://example.com:32/foo?fpp=bar', 'url rendered as expected')
    t.end()
  })

  suite.test('host, path, port, query string, password', function (t) {
    const options = {
      host: 'username:password@example.com',
      path: '/foo?fpp=bar',
      port: 32
    }
    const req = requestFromOptions(options)

    const url = getUrlFromRequestAndOptions(req, options)
    t.equals(url, 'http://example.com:32/foo?fpp=bar', 'url rendered as expected')
    t.end()
  })

  suite.test('passes URL string to request but also options', function (t) {
    const options = {
      host: 'username:password@one.example.com'
    }
    const req = requestFromUrlAndOptions(
      'http://username2:password2@two.example.com/bar',
      options
    )
    const url = getUrlFromRequestAndOptions(req, options)
    t.equals(url, 'http://two.example.com/bar', 'url rendered as expected')
    t.end()
  })

  suite.test('exceptions caught', function (t) {
    const options = {
      host: 'username:password@one.example.com'
    }
    const req = requestFromUrlAndOptions(
      'http://username2:password2@two.example.com/bar',
      options
    )
    const url1 = getUrlFromRequestAndOptions(null, null)
    const url2 = getUrlFromRequestAndOptions(req, null)
    const url3 = getUrlFromRequestAndOptions(null, options)
    const url4 = getUrlFromRequestAndOptions({}, options)

    t.equal(url1, false, 'no url returned')
    t.equal(url2, 'http://two.example.com/bar', 'no url returned')
    t.equal(url3, false, 'no url returned')
    t.equal(url4, false, 'no url returned')
    t.end()
  })

  suite.end()
})
