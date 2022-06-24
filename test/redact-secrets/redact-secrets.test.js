/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
// This module is a fork of
// https://github.com/watson/redact-secrets/blob/v1.0.0/test.js
// The MIT License (MIT)

// Copyright (c) 2016 Thomas Watson Steen

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// `redact` below assumes there is a configured agent.
require('../..').start({
  disableSend: true
})

var test = require('tape')
var clone = require('clone')
var redact = require('../../lib/redact-secrets')

test('redact.map', function (t) {
  var input = {
    foo: 'non-secret',
    secret: 'secret',
    sub1: {
      foo: 'non-secret',
      password: 'secret'
    },
    sub2: [{
      foo: 'non-secret',
      token: 'secret'
    }]
  }

  var expected = {
    foo: 'non-secret',
    secret: 'redacted',
    sub1: {
      foo: 'non-secret',
      password: 'redacted'
    },
    sub2: [{
      foo: 'non-secret',
      token: 'redacted'
    }]
  }

  var orig = clone(input)
  var result = redact('redacted').map(input)

  t.deepEqual(result, expected)
  t.deepEqual(input, orig)
  t.end()
})

test('redact.forEach', function (t) {
  var input = {
    foo: 'non-secret',
    secret: 'secret',
    sub1: {
      foo: 'non-secret',
      password: 'secret'
    },
    sub2: [{
      foo: 'non-secret',
      token: 'secret'
    }]
  }

  var expected = {
    foo: 'non-secret',
    secret: 'redacted',
    sub1: {
      foo: 'non-secret',
      password: 'redacted'
    },
    sub2: [{
      foo: 'non-secret',
      token: 'redacted'
    }]
  }

  var result = redact('redacted').forEach(input)

  t.equal(result, undefined)
  t.deepEqual(input, expected)
  t.end()
})
