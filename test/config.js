const tape = require('tape')
const { toSeconds, normalizePositiveTime } = require('../lib/config')
tape.test(function (t) {
  t.ok('hello')
  t.ok(toSeconds)

  // const fixtures = {
  //   '30s':30,
  //   '2000ms':2,
  //   '1m':60,
  //   30:30,
  //   null:null,
  //   '-1s':-1,
  //   '-1000ms':-1
  // }

  const fixtures = {
    '30s': 30,
    '2000ms': 2,
    '1m': 60,
    30: 30,
    null: 10,
    '-1s': 10,
    '-1000ms': 10,
    '-1': 10
  }

  // for(const [input, output] of Object.entries(fixtures)) {
  //   t.equals(toSeconds(input, false), output)
  // }

  // t.equals(toSeconds(undefined, false), null)
  const logger = {
    warn: function () {
      console.log(arguments)
    }
  }
  for (const [input, output] of Object.entries(fixtures)) {
    const opts = {
      foo: '30s',
      apiRequestTime: input
    }
    normalizePositiveTime(opts, logger)
    t.equals(opts.apiRequestTime, output, `fixture value ${input} converted correctly`)
    t.equals(opts.foo, '30s', 'foo is untouched')
  }

  const opts = {
    foo: '30s',
    apiRequestTime: undefined
  }
  normalizePositiveTime(opts, logger)
  t.equals(opts.apiRequestTime, 10)
  t.end()
})
