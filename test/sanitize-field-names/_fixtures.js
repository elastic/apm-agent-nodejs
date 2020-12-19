'use strict'
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
        keepmeRequest: 'request'
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
        keepmeResponse: 'response'
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
        keepmeForm: 'formFields'
      }
    },
    expected: {
      requestHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeRequest: 'request' }
      },
      responseHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeResponse: 'response' }
      },
      formFields: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeForm: 'formFields' }
      }
    }
  },
  {
    name: 'tests deault wildcard handling, with text bodyparsing',
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
        keepmeRequest: 'request'
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
        keepmeResponse: 'response'
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
        keepmeForm: 'formFields'
      }
    },
    expected: {
      requestHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeRequest: 'request' }
      },
      responseHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeResponse: 'response' }
      },
      formFields: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeForm: 'formFields' }
      }
    }
  },
  {
    name: 'tests deault wildcard handling, with raw/Buffer bodyparsing',
    agentConfig: {},
    bodyParsing: 'raw',
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
        keepmeRequest: 'request'
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
        keepmeResponse: 'response'
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
        keepmeForm: 'formFields'
      }
    },
    expected: {
      requestHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeRequest: 'request' }
      },
      responseHeaders: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeResponse: 'response' }
      },
      formFields: {
        undefined: [
          'password', 'passwd', 'pwd', 'secret', 'Somethingkey', 'FOOtokenBAR',
          'ZIPsessionZAP', 'FOOsessionBAR', 'FULLOFcreditBEES', 'SINGcardSONG',
          'authorization', 'set-cookie'
        ],
        defined: { keepmeForm: 'formFields' }
      }
    }
  },

  {
    name: 'tests configured wildcard handling, with urlencode bodyparsing',
    agentConfig: {
      sanitizeFieldNames: ['thi*isa']
    },
    bodyParsing: 'urlencoded',
    input: {
      requestHeaders: {
        password: 'one',
        thisisa: 'test'
      },
      responseHeaders: {
        passwd: 'two',
        thisisa: 'second test'
      },
      formFields: {
        Somethingkey: 'five',
        thisisa: 'second test'
      }
    },
    expected: {
      // if users configure a wildcard pattern we expect that
      // 1. the defaults won't apply
      // 2. keys matching the wildcard will be omitted
      requestHeaders: {
        undefined: ['thisisa'],
        defined: { password: 'one' }
      },
      responseHeaders: {
        undefined: ['thisisa'],
        defined: { passwd: 'two' }
      },
      formFields: {
        undefined: ['thisisa'],
        defined: { Somethingkey: 'five' }
      }
    }
  }
]
