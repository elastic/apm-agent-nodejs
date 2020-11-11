module.exports = {
  testMatchesStartsWith: {
    'foo*': {
      foo: true,
      foobar: true,
      bar: false,
      barfoo: false,
      rfoo: false
    }
  },
  testWildcardInTheMiddle: {
    '/foo/*/baz': {
      '/foo/bar/baz': true,
      '/foo/bar': false
    }
  },
  testCompoundWildcardMatcher: {
    '*foo*foo*': {
      foofoo: true,
      'foo/bar/foo': true,
      '/foo/bar/foo/bar': true,
      foo: false
    }
  },
  testCompoundWildcardMatcher3: {
    '*foo*oo*': {
      foooo: true,
      foofoo: true,
      'foo/bar/foo': true,
      '/foo/bar/foo/bar': true,
      foo: false,
      fooo: false
    }
  },
  testCompoundWildcardMatcher2: {
    '*foo*bar*': {
      foobar: true,
      'foo/bar/foo/baz': true,
      '/foo/bar/baz': true,
      'bar/foo': false,
      barfoo: false
    }
  },
  testCompoundWildcardMatcher4: {
    '*foo*far*': {
      foofar: true,
      'foo/far/foo/baz': true,
      '/foo/far/baz': true,
      '/far/foo': false,
      farfoo: false
    }
  },
  testMatchBetween: {
    '*foo*foo*': {
      foofoo: true,
      'foo/foo/foo/baz': true,
      '/foo/foo/baz': true,
      '/foo/foo': true,
      foobar: false
    }
  },
  testComplexExpressions: {
    '/foo/*/baz*': {
      '/foo/a/bar/b/baz': true
    },
    '/foo/*/bar/*/baz': {
      '/foo/a/bar/b/baz': true
    }
  },
  testInfixEmptyMatcher: {
    '**': {
      '': true,
      foo: true
    }
  },
  testMatchesEndsWith: {
    '*foo': {
      foo: true,
      foobar: false,
      bar: false,
      barfoo: true,
      foor: false
    }
  },
  testMatchesEquals: {
    foo: {
      foo: true,
      foobar: false,
      bar: false,
      barfoo: false
    }
  },
  testMatchesInfix: {
    '*foo*': {
      foo: true,
      foobar: true,
      bar: false,
      barfoo: true,
      barfoobaz: true
    }
  },
  testMatchesNoWildcard: {
    foo: {
      foo: true,
      foobar: false
    }
  },
  testMatchesStartsWith_ignoreCase: {
    'foo*': {
      foo: true,
      foobar: true,
      bar: false,
      barfoo: false
    }
  },
  testInfixEmptyMatcher_ignoreCase: {
    '**': {
      '': true,
      foo: true
    }
  },
  testMatchesEndsWith_ignoreCase: {
    '*foo': {
      fOo: true,
      foobar: false,
      bar: false,
      baRFoo: true
    }
  },
  testMatchesEquals_ignoreCase: {
    foo: {
      fOo: true,
      foOBar: false,
      BAR: false,
      barfoo: false
    }
  },
  testMatchesInfix_ignoreCase: {
    '*foo*': {
      FOO: true,
      foOBar: true,
      BAR: false,
      baRFOo: true,
      BARFOOBAZ: true
    }
  },
  testMatchesInfix_caseSensitive: {
    '(?-i)*foo*': {
      foo: true,
      FOO: false
    }
  },
  testMatchesNoWildcard_ignoreCase: {
    foo: {
      FOO: true,
      foobar: false
    }
  },
  testNeedleLongerThanHaystack: {
    '*foo': {
      baz: false
    },
    '*foob': {
      baz: false
    },
    '*fooba': {
      baz: false
    },
    '*foobar': {
      baz: false
    },
    'foo*': {
      baz: false
    },
    'foob*': {
      baz: false
    },
    'fooba*': {
      baz: false
    },
    'foobar*': {
      baz: false
    },
    '*foobar*': {
      baz: false
    }
  },
  testSingleCharacterWildcardNotSupported: {
    'fo?': {
      foo: false,
      'fo?': true
    }
  }
}
