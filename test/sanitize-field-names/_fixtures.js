/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
/**
 * Description of the test fixture's structure
 *
 * const fixture = {
 *   name: '', // the name of the test,
 *   agentConfig: {}, // additional default configuration values for agent
 *   middleware: '', // what sort of body parsing to do for application/x-www-form-urlencoded
 *   // urlencoded -- test runner should parse values into an object
 *   // raw        -- test runner should provide raw Buffer object
 *   // text       -- test runner should provide string parsing
 *   // introduced to handle express middleware body parsers
 *   input: {
 *     requestHeaders: {}, // key/value pairs of HTTP request header values to set
 *     responseHeaders: {}, // key/value pairs of HTTP response header values to set
 *     formFields: {} // key/value pairs of form data to post
 *   },
 *   expected: {
 *     requestHeaders: {
 *       defined: [], // list of header keys we expected to be reported
 *       undefined: [] // list of header fields we expected to be sanitized
 *     },
 *     responseHeaders: {
 *       defined: [], // list of header keys we expected to be reported
 *       undefined: [] // list of header fields we expected to be sanitized
 *     },
 *     formFields: {
 *       defined: [], // list of form keys we expected to be reported
 *       undefined: [] // list of form fields we expected to be sanitized
 *     }
 *   }
 * }
 *
 */
module.exports = [
  {
    name: 'tests default wildcard handling, with urlencode bodyparsing',
    agentConfig: {},
    bodyParsing: 'urlencoded',
    input: {
      requestHeaders: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeRequest: 'request',
      },
      responseHeaders: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeResponse: 'response',
      },
      formFields: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeForm: 'formFields',
      },
    },
    expected: {
      requestHeaders: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeRequest: 'request' },
      },
      responseHeaders: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeResponse: 'response' },
      },
      formFields: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeForm: 'formFields' },
      },
    },
  },
  {
    name: 'tests default wildcard handling, with text bodyparsing',
    agentConfig: {},
    bodyParsing: 'text',
    input: {
      requestHeaders: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeRequest: 'request',
      },
      responseHeaders: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeResponse: 'response',
      },
      formFields: {
        password: 'one',
        passwd: 'two',
        pwd: 'three',
        secret: 'four',
        Somethingkey: 'five',
        FOOtokenBAR: 'six',
        ZIPsessionZAP: 'seven',
        FOOsessionBAR: 'eight',
        FULLOFcreditBEES: 'nine',
        SINGcardSONG: 'ten',
        authorization: 'eleven',
        'set-cookie': 'twelve',
        'X-Authy-Thing': 'thirteen',
        'X-Ms-Client-Principal': 'fourteen',
        keepmeForm: 'formFields',
      },
    },
    expected: {
      requestHeaders: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeRequest: 'request' },
      },
      responseHeaders: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeResponse: 'response' },
      },
      formFields: {
        undefined: [
          'password',
          'passwd',
          'pwd',
          'secret',
          'Somethingkey',
          'FOOtokenBAR',
          'ZIPsessionZAP',
          'FOOsessionBAR',
          'FULLOFcreditBEES',
          'SINGcardSONG',
          'authorization',
          'set-cookie',
          'X-Authy-Thing',
          'X-Ms-Client-Principal',
        ],
        defined: { keepmeForm: 'formFields' },
      },
    },
  },
  {
    name: 'tests configured wildcard handling, with urlencode bodyparsing',
    agentConfig: {
      sanitizeFieldNames: ['thi*isa'],
    },
    bodyParsing: 'urlencoded',
    input: {
      requestHeaders: {
        password: 'one',
        thisisa: 'test',
      },
      responseHeaders: {
        passwd: 'two',
        thisisa: 'second test',
      },
      formFields: {
        Somethingkey: 'five',
        thisisa: 'second test',
      },
    },
    expected: {
      // if users configure a wildcard pattern we expect that
      // 1. the defaults won't apply
      // 2. keys matching the wildcard will be omitted
      requestHeaders: {
        undefined: ['thisisa'],
        defined: { password: 'one' },
      },
      responseHeaders: {
        undefined: ['thisisa'],
        defined: { passwd: 'two' },
      },
      formFields: {
        undefined: ['thisisa'],
        defined: { Somethingkey: 'five' },
      },
    },
  },
  {
    name: 'tests configured wildcard handling, case insensativity turned off',
    agentConfig: {
      sanitizeFieldNames: ['(?-i)Thi*isa'],
    },
    bodyParsing: 'urlencoded',
    input: {
      requestHeaders: {
        password: 'one',
        thisisa: 'test',
      },
      responseHeaders: {
        passwd: 'two',
        thisisa: 'second test',
      },
      formFields: {
        Somethingkey: 'five',
        thisisa: 'third test',
      },
    },
    expected: {
      // we expect the case insenitivity being on means values are not stripped
      // since it's specified with _Thi*isa_
      requestHeaders: {
        undefined: [],
        defined: { password: 'one', thisisa: 'test' },
      },
      responseHeaders: {
        undefined: [],
        defined: { passwd: 'two', thisisa: 'second test' },
      },
      formFields: {
        undefined: [],
        defined: { Somethingkey: 'five', thisisa: 'third test' },
      },
    },
  },
];
