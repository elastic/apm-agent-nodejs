/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
// This module is a fork of
// https://github.com/watson/is-secret/blob/v1.2.1/test.js
// The MIT License (MIT)

// Copyright (c) 2016-2018 Thomas Watson Steen

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

// `isSecret` below assumes there is a configured agent.
require('../..').start({
  disableSend: true
})

var test = require('tape')
var isSecret = require('../../lib/redact-secrets/is-secret')

test('isSecret.key true', function (t) {
  t.equal(isSecret.key('pass'), true)
  t.equal(isSecret.key('password'), true)
  t.equal(isSecret.key('api-key'), true)
  t.equal(isSecret.key('api.key'), true)
  t.equal(isSecret.key('api_key'), true)
  t.equal(isSecret.key('apikey'), true)
  t.equal(isSecret.key('api*key'), true)
  t.end()
})

test('isSecret.key false', function (t) {
  t.equal(isSecret.key('passport'), false)
  t.equal(isSecret.key('copenhagen'), false)
  t.end()
})

test('isSecret.value credt card number', function (t) {
  t.equal(isSecret.value('1234 1234 1234 1234'), true)
  t.equal(isSecret.value('1234-1234-1234-1234'), true)
  t.equal(isSecret.value('1234123412341234'), true)
  t.end()
})

test('isSecret.value false', function (t) {
  t.equal(isSecret.value('foobar'), false)
  t.end()
})
