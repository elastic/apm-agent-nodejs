'use strict'
const querystring = require('querystring')
const test = require('tape')

const {
  removeKeysFromObject,
  removeKeysFromPostedFormVariables
} = require('../../lib/filters/sanitize-field-names')

test('removeKeysFromObject unit tests', function (t) {
  t.ok(removeKeysFromObject, 'can import function')

  const obj1 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  removeKeysFromObject(obj1, [/th.*ee/])
  t.ok(!obj1.three, 'key three removed from object')
  t.equals(obj1.one, 'two', 'key one remains in ibject')
  t.equals(obj1.five, 'six', 'key five remains in object')

  const obj2 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  removeKeysFromObject(obj2, [/th.*ee/, /three/, /.*five/])
  t.ok(!obj2.three, 'key three removed from object')
  t.equals(obj2.one, 'two', 'key one remains in ibject')
  t.ok(!obj2.five, 'key five removed from object')

  t.end()
})

test('removeKeysFromObject tests', function (t) {
  t.ok(removeKeysFromObject, 'can import function')

  const obj1 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  removeKeysFromObject(obj1, [/th.*ee/])
  t.ok(!obj1.three, 'key three removed from object')
  t.equals(obj1.one, 'two', 'key one remains in ibject')
  t.equals(obj1.five, 'six', 'key five remains in object')

  const obj2 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  removeKeysFromObject(obj2, [/th.*ee/, /three/, /.*five/])
  t.ok(!obj2.three, 'key three removed from object')
  t.equals(obj2.one, 'two', 'key one remains in ibject')
  t.ok(!obj2.five, 'key five removed from object')

  t.end()
})

test('removeKeysFromPostedFormVariables tests', function (t) {
  t.ok(removeKeysFromPostedFormVariables, 'can import function')

  const requestHeaders = {
    'content-type': 'application/x-www-form-urlencoded'
  }
  // body as parsed object
  const body1 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  const result1 = removeKeysFromPostedFormVariables(
    body1,
    requestHeaders,
    [/five*/]
  )
  t.equals(result1.three, 'four', 'key three removed from object')
  t.equals(result1.one, 'two', 'key one remains in object')
  t.ok(!result1.five, 'key five removed from object')

  // body as string
  const body2 = 'one=two&three=four&five=six'
  const result2 = querystring.parse(
    removeKeysFromPostedFormVariables(
      body2,
      requestHeaders,
      [/one/]
    )
  )

  t.equals(result2.three, 'four', 'key three remains in object')
  t.ok(!result2.one, 'key one removed from object')
  t.equals(result2.five, 'six', 'key five remains in object')

  // body as raw array of bytes
  const body3 = Buffer.from(body2)
  const result3 = querystring.parse(
    removeKeysFromPostedFormVariables(
      body3,
      requestHeaders,
      [/one/, /th*/]
    ).toString()
  )

  t.ok(!result3.three, 'key three removed from object')
  t.ok(!result3.one, 'key one removed from object')
  t.equals(result3.five, 'six', 'key five remains in object')

  // untouched due to no application/x-www-form-urlencoded header
  const body4 = {
    one: 'two',
    three: 'four',
    five: 'six'
  }
  const result4 = removeKeysFromPostedFormVariables(
    body4,
    { 'content-type': 'text/plain' },
    [/five*/]
  )
  t.equals(result4.three, 'four', 'key three removed from object')
  t.equals(result4.one, 'two', 'key one remains in object')
  t.equals(result4.five, 'six', 'key five remains in object')

  t.end()
})
