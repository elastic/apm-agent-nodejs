/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
const querystring = require('querystring')
const test = require('tape')

const {
  redactKeysFromObject,
  redactKeysFromPostedFormVariables
} = require('../../lib/filters/sanitize-field-names')

test('redactKeysFromObject tests', function (t) {
  t.ok(redactKeysFromObject, 'can import function')

  const obj1 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  redactKeysFromObject(obj1, [/th.*ee/])
  t.equals(obj1.three, '[REDACTED]', 'key three redacted')
  t.equals(obj1.one, 'two', 'key one remains in ibject')
  t.equals(obj1.five, 'six', 'key five remains in object')

  const obj2 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  redactKeysFromObject(obj2, [/th.*ee/, /three/, /.*five/])
  t.equals(obj2.three, '[REDACTED]', 'key three redacted')
  t.equals(obj2.one, 'two', 'key one remains in ibject')
  t.equals(obj2.five, '[REDACTED]', 'key five redacted')

  t.end()
})

test('redactKeysFromPostedFormVariables tests', function (t) {
  t.ok(redactKeysFromPostedFormVariables, 'can import function')

  const requestHeaders = {
    'content-type': 'application/x-www-form-urlencoded'
  }
  // body as parsed object
  const body1 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  const result1 = redactKeysFromPostedFormVariables(
    body1,
    requestHeaders,
    [/five*/]
  )
  t.equals(result1.three, 'four', 'key three removed from object')
  t.equals(result1.one, 'two', 'key one remains in object')
  t.equals(result1.five, '[REDACTED]', 'key five redacted')

  // body as string
  const body2 = 'one=two&three=four&five=six'
  const result2 = querystring.parse(
    redactKeysFromPostedFormVariables(
      body2,
      requestHeaders,
      [/one/]
    )
  )

  t.equals(result2.three, 'four', 'key three remains in object')
  t.equals(result2.one, '[REDACTED]', 'key one redacted')
  t.equals(result2.five, 'six', 'key five remains in object')

  // untouched due to no application/x-www-form-urlencoded header
  const body4 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  const result4 = redactKeysFromPostedFormVariables(
    body4,
    { 'content-type': 'text/plain' },
    [/five*/]
  )
  t.equals(result4.three, 'four', 'key three removed from object')
  t.equals(result4.one, 'two', 'key one remains in object')
  t.equals(result4.five, 'six', 'key five remains in object')

  t.end()
})
