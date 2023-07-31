/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the normalizer functions
const test = require('tape');
const { MockLogger } = require('../_mock_logger');

const {
  TRACE_CONTINUATION_STRATEGY_CONTINUE,
  TRACE_CONTINUATION_STRATEGY_RESTART,
  CONTEXT_MANAGER_PATCH,
} = require('../../lib/config/schema');
const {
  normalizeUrls,
  normalizeArrays,
  normalizeBools,
  normalizeBytes,
  normalizeDurationOptions,
  normalizeIgnoreOptions,
  normalizeInfinity,
  normalizeKeyValuePairs,
  normalizeNumbers,
  normalizeElasticsearchCaptureBodyUrls,
  normalizeDisableMetrics,
  normalizeSanitizeFieldNames,
  normalizeCloudProvider,
  normalizeCustomMetricsHistogramBoundaries,
  normalizeTransactionSampleRate,
  normalizeTraceContinuationStrategy,
  normalizeContextManager,
  normalizeSpanStackTraceMinDuration,
} = require('../../lib/config/normalizers');

test('#normalizeArrays()', function (t) {
  const opts = { arrayOpt: ['a', 'b'], stringOpt: '1,2,3', numberOpt: 2 };

  normalizeArrays(opts, ['arrayOpt', 'stringOpt']);

  t.deepEqual(opts, {
    arrayOpt: ['a', 'b'],
    stringOpt: ['1', '2', '3'],
    numberOpt: 2,
  });
  t.end();
});

test('#normalizeUrls()', function (t) {
  const logger = new MockLogger();
  const fields = [
    'urlHttp',
    'urlHttps',
    'urlWithPort',
    'urlNegativePort',
    'urlTooHighPort',
    'urlInvalid',
  ];
  const defaults = {};
  const opts = {
    urlHttp: 'http://domain.com/path?query=true',
    urlHttps: 'https://domain.com/path?query=true',
    urlWithPort: 'https://domain.com:4200/path?query=true',
    urlNegativePort: 'https://domain.com:-1/path?query=true',
    urlTooHighPort: 'https://domain.com:65536/path?query=true',
    urlInvalid: 'foo',
  };

  normalizeUrls(opts, fields, defaults, logger);

  t.deepEqual(opts, {
    urlHttp: 'http://domain.com/path?query=true',
    urlHttps: 'https://domain.com/path?query=true',
    urlWithPort: 'https://domain.com:4200/path?query=true',
    urlNegativePort: null,
    urlTooHighPort: null,
    urlInvalid: null,
  });

  const warnings = logger.calls;
  t.ok(warnings.length === 3, 'we got warnings for bad URL options');
  t.deepEqual(warnings[0].interpolation, ['urlNegativePort']);
  t.deepEqual(warnings[1].interpolation, ['urlTooHighPort']);
  t.deepEqual(warnings[2].interpolation, ['urlInvalid']);
  t.end();
});

test('#normalizeBools()', function (t) {
  const logger = new MockLogger();
  const fields = [
    'boolTrue',
    'boolFalse',
    'strTrue',
    'strFalse',
    'badWithDefault',
    'badWithoutDefault',
  ];
  const defaults = { badWithDefault: false };
  const opts = {
    boolTrue: true,
    boolFalse: false,
    strTrue: 'true',
    strFalse: 'false',
    badWithDefault: 'not-a-bool',
    badWithoutDefault: 'not-a-bool',
    nonBoolProperty: 25,
  };

  normalizeBools(opts, fields, defaults, logger);

  t.deepEqual(opts, {
    boolTrue: true,
    boolFalse: false,
    strTrue: true,
    strFalse: false,
    badWithDefault: undefined,
    badWithoutDefault: undefined,
    nonBoolProperty: 25,
  });

  const warnings = logger.calls;
  t.ok(warnings.length === 2, 'we got warnings for bad boolean options');
  t.deepEqual(warnings[0].interpolation, ['not-a-bool', 'badWithDefault']);
  t.deepEqual(warnings[1].interpolation, ['not-a-bool', 'badWithoutDefault']);
  t.end();
});

test('#normalizeBytes()', function (t) {
  const logger = new MockLogger();
  const fields = [
    'bytes',
    'kiloBytes',
    'megaBytes',
    'gigaBytes',
    'numberBytes',
    'badWithDefault',
    'badWithoutDefault',
  ];
  const defaults = { badWithDefault: '25kb' };
  const opts = {
    bytes: '1000b',
    kiloBytes: '100kb',
    megaBytes: '10mb',
    gigaBytes: '1gb',
    numberBytes: 12345678,
    badWithDefault: 'not-bytes',
    badWithoutDefault: 'not-bytes',
    anotherProperty: 25,
  };

  normalizeBytes(opts, fields, defaults, logger);

  t.deepEqual(opts, {
    bytes: 1000,
    kiloBytes: 102400,
    megaBytes: 10485760,
    gigaBytes: 1073741824,
    numberBytes: 12345678,
    badWithDefault: NaN,
    badWithoutDefault: NaN,
    anotherProperty: 25,
  });

  t.ok(logger.calls.length === 0, 'we got no warnings for bad byte options');
  t.end();
});

test('#normalizeDurationOptions()', function (t) {
  const logger = new MockLogger();
  const fields = [
    {
      name: 'withoutUnit',
      defaultUnit: 'ms',
      allowedUnits: ['us', 'ms', 's', 'm'],
      allowNegative: true,
    },
    {
      name: 'withUnit',
      defaultUnit: 'ms',
      allowedUnits: ['us', 'ms', 's', 'm'],
      allowNegative: true,
    },
    {
      name: 'notAllowedUnit',
      defaultUnit: 's',
      allowedUnits: ['s', 'm'],
      allowNegative: true,
    },
    {
      name: 'notAllowedNegative',
      defaultUnit: 's',
      allowedUnits: ['s', 'm'],
      allowNegative: false,
    },
    {
      name: 'badWithDefault',
      defaultUnit: 's',
      allowedUnits: ['s', 'm'],
      allowNegative: false,
    },
    {
      name: 'badWithoutDefault',
      defaultUnit: 's',
      allowedUnits: ['s', 'm'],
      allowNegative: false,
    },
  ];
  const defaults = { badWithDefault: '25s' };
  const opts = {
    withoutUnit: '200',
    withUnit: '2m',
    notAllowedUnit: '20us',
    notAllowedNegative: '-1s',
    badWithDefault: 'not-duration',
    badWithoutDefault: 'not-duration',
    anotherProperty: 25,
  };

  normalizeDurationOptions(opts, fields, defaults, logger);

  t.deepEqual(opts, {
    // TODO: this normalized deletes keys whose values are not valid (because format or contraint)
    // other normalizers keep the property as is. Should we remove as well?
    withoutUnit: 0.2,
    withUnit: 120,
    badWithDefault: 25,
    anotherProperty: 25,
  });

  const warnings = logger.calls;
  t.ok(warnings.length === 4, 'we got warnings for bad duration options');
  t.ok(
    warnings[0].message.indexOf('ignoring this option') !== -1,
    'ignores not allowed unit',
  );
  t.deepEqual(warnings[0].interpolation, ['20us', 'notAllowedUnit']);
  t.ok(
    warnings[1].message.indexOf('ignoring this option') !== -1,
    'ignores not allowed negative value',
  );
  t.deepEqual(warnings[1].interpolation, ['-1s', 'notAllowedNegative']);
  t.ok(
    warnings[2].message.indexOf('using default') !== -1,
    'uses default value',
  );
  t.deepEqual(warnings[2].interpolation, [
    'not-duration',
    'badWithDefault',
    '25s',
  ]);
  t.ok(
    warnings[3].message.indexOf('ignoring this option') !== -1,
    'ignores bad value without default',
  );
  t.deepEqual(warnings[3].interpolation, ['not-duration', 'badWithoutDefault']);
  t.end();
});

test('#normalizeIgnoreOptions()', function (t) {
  const logger = new MockLogger();
  const defaults = {};
  const opts = {
    transactionIgnoreUrls: ['*path*'],
    ignoreUrls: ['str/path/ignore', /path\/to\/secret/],
    ignoreUserAgents: ['Mozilla', /Safari/],
    ignoreMessageQueues: ['*topic*'],
  };

  normalizeIgnoreOptions(opts, Object.keys(opts), defaults, logger);

  t.deepEqual(opts, {
    transactionIgnoreUrls: ['*path*'],
    transactionIgnoreUrlRegExp: [/^.*path.*$/i],
    ignoreUrlStr: ['str/path/ignore'],
    ignoreUrlRegExp: [/path\/to\/secret/],
    ignoreUserAgentStr: ['Mozilla'],
    ignoreUserAgentRegExp: [/Safari/],
    ignoreMessageQueues: ['*topic*'],
    ignoreMessageQueuesRegExp: [/^.*topic.*$/i],
  });

  t.ok(logger.calls.length === 0, 'we got no warnings for bad ignore options');
  t.end();
});

test('#normalizeInfinity()', function (t) {
  const logger = new MockLogger();
  const fields = ['minusOne'];
  const defaults = {};
  const opts = {
    positiveNumber: 100,
    negativeNumber: -100,
    minusOne: -1,
    anotherProperty: 'value',
  };

  normalizeInfinity(opts, fields, defaults, logger);

  t.deepEqual(opts, {
    positiveNumber: 100,
    negativeNumber: -100,
    minusOne: Infinity,
    anotherProperty: 'value',
  });

  t.ok(logger.calls.length === 0, 'we got no warnings for bad ignore options');
  t.end();
});

test.skip('#normalizeKeyValuePairs()', function (t) {
  const logger = new MockLogger();
  const defaults = {};
  const opts = {
    objectProperty: { foo: 'bar', eggs: 'spam' },
    stringProperty: 'foo=bar, eggs=spam',
    arrayProperty: ['foo=bar', 'eggs=spam'],
    badWithDefault: 234,
    badWithoutDefault: 234,
  };

  normalizeKeyValuePairs(opts, Object.keys(opts), defaults, logger);

  // TODO: they should all be in the same format, shouldn't they?
  t.deepEqual(opts, {
    objectProperty: [
      ['foo', 'bar'],
      ['eggs', 'spam'],
    ],
    stringProperty: [
      ['foo', 'bar'],
      ['eggs', 'spam'],
    ],
    arrayProperty: [
      ['foo', 'bar'],
      ['eggs', 'spam'],
    ],
    badWithDefault: 234,
    badWithoutDefault: 234,
  });

  t.ok(
    logger.calls.length === 0,
    'we got no warnings for bad key/value options',
  );
  t.end();
});

test('#normalizeNumbers()', function (t) {
  const logger = new MockLogger();
  const defaults = { badWithDefault: 300 };
  const opts = {
    numberProperty: 100,
    stringProperty: '200',
    badWithDefault: 'not-a-number',
    badWithoutDefault: 'not-a-number',
  };

  normalizeNumbers(opts, Object.keys(opts), defaults, logger);

  t.deepEqual(opts, {
    numberProperty: 100,
    stringProperty: 200,
    badWithDefault: NaN,
    badWithoutDefault: NaN,
  });

  t.ok(logger.calls.length === 0, 'we got no warnings for bad number options');
  t.end();
});

test('#normalizeElasticsearchCaptureBodyUrls()', function (t) {
  const logger = new MockLogger();
  const defaults = {};
  const opts = {
    elasticsearchCaptureBodyUrls: ['*body*'],
  };

  normalizeElasticsearchCaptureBodyUrls(
    opts,
    Object.keys(opts),
    defaults,
    logger,
  );

  t.deepEqual(opts, {
    elasticsearchCaptureBodyUrls: ['*body*'],
    elasticsearchCaptureBodyUrlsRegExp: [/^.*body.*$/i],
  });
  t.end();
});

test('#normalizeDisableMetrics()', function (t) {
  const logger = new MockLogger();
  const defaults = {};
  const opts = {
    disableMetrics: ['*metric*'],
  };

  normalizeDisableMetrics(opts, Object.keys(opts), defaults, logger);

  t.deepEqual(opts, {
    disableMetrics: ['*metric*'],
    disableMetricsRegExp: [/^.*metric.*$/i],
  });
  t.end();
});

test('#normalizeSanitizeFieldNames()', function (t) {
  const logger = new MockLogger();
  const defaults = {};
  const opts = {
    sanitizeFieldNames: ['*secret*'],
  };

  normalizeSanitizeFieldNames(opts, Object.keys(opts), defaults, logger);

  t.deepEqual(opts, {
    sanitizeFieldNames: ['*secret*'],
    sanitizeFieldNamesRegExp: [/^.*secret.*$/i],
  });
  t.end();
});

test('#normalizeCloudProvider()', function (t) {
  const logger = new MockLogger();
  const allowedValues = ['auto', 'gcp', 'azure', 'aws', 'none'];
  const defaults = { cloudProvider: 'auto' };
  const opts = { cloudProvider: '' };

  for (const value of allowedValues) {
    opts.cloudProvider = value;
    normalizeCloudProvider(opts, Object.keys(opts), defaults, logger);

    t.deepEqual(opts, { cloudProvider: value });
  }

  opts.cloudProvider = 'unknown';
  normalizeCloudProvider(opts, Object.keys(opts), defaults, logger);

  t.deepEqual(opts, { cloudProvider: defaults.cloudProvider });
  const warnings = logger.calls;
  t.ok(warnings.length === 1, 'we got warnings for bad cloudProvider options');
  t.ok(
    warnings[0].message.indexOf('Invalid "cloudProvider" config value') !== -1,
    'warns about invalid value',
  );
  t.deepEqual(warnings[0].interpolation, ['unknown', 'auto']);
  t.end();
});

test('#normalizeCustomMetricsHistogramBoundaries()', function (t) {
  const logger = new MockLogger();
  const warnings = logger.calls;
  const defaults = { customMetricsHistogramBoundaries: [1, 2, 3, 4] };
  const opts = {};

  const badInputs = [
    { val: 2, errReason: 'value is not an array' },
    { val: 'test', errReason: 'array includes non-numbers' },
    { val: [1, 'test'], errReason: 'array includes non-numbers' },
    { val: [1, 0], errReason: 'array is not sorted' },
    { val: [1, 2, 2], errReason: 'array has duplicate values' },
  ];

  for (const input of badInputs) {
    opts.customMetricsHistogramBoundaries = input.val;
    normalizeCustomMetricsHistogramBoundaries(opts, [], defaults, logger);
    t.deepEqual(opts.customMetricsHistogramBoundaries, [1, 2, 3, 4]);
    const lastWarnig = warnings.pop();
    t.ok(
      typeof lastWarnig !== 'undefined',
      'we got warnings for "' + input.errReason + '"',
    );
    t.deepEqual(lastWarnig.interpolation, [input.val, input.errReason]);
  }

  const goodInputs = [{ val: [1, 2, 3] }, { val: '1,2,3' }];

  for (const input of goodInputs) {
    opts.customMetricsHistogramBoundaries = input.val;
    normalizeCustomMetricsHistogramBoundaries(opts, [], defaults, logger);
    t.deepEqual(opts.customMetricsHistogramBoundaries, [1, 2, 3]);
    const lastWarnig = warnings.pop();
    t.ok(typeof lastWarnig === 'undefined', 'we got no warnings');
  }
  t.end();
});

test('#normalizeTransactionSampleRate()', function (t) {
  const logger = new MockLogger();
  const defaults = { transactionSampleRate: 0.5 };
  const opts = {};

  const badValues = [2, -1, NaN];
  for (const value of badValues) {
    opts.transactionSampleRate = value;
    normalizeTransactionSampleRate(opts, [], defaults, logger);

    t.deepEqual(opts, { transactionSampleRate: 0.5 });
    const warning = logger.calls[logger.calls.length - 1];
    t.ok(warning.message.indexOf('Invalid "transactionSampleRate"') !== -1);
  }

  const goodValues = [0, 0.8, 1];
  for (const value of goodValues) {
    opts.transactionSampleRate = value;
    normalizeTransactionSampleRate(opts, [], defaults, logger);
    t.deepEqual(opts, { transactionSampleRate: value });
  }

  // Special case for really small numbers
  opts.transactionSampleRate = 0.000001;
  normalizeTransactionSampleRate(opts, [], defaults, logger);
  t.deepEqual(opts, { transactionSampleRate: 0.0001 });

  t.end();
});

test('#normalizeTraceContinuationStrategy()', function (t) {
  const logger = new MockLogger();
  const defaults = {
    traceContinuationStrategy: TRACE_CONTINUATION_STRATEGY_CONTINUE,
  };
  const opts = {};

  opts.traceContinuationStrategy = 'not-valid';
  normalizeTraceContinuationStrategy(opts, [], defaults, logger);

  t.deepEqual(opts, {
    traceContinuationStrategy: TRACE_CONTINUATION_STRATEGY_CONTINUE,
  });
  const warning = logger.calls[logger.calls.length - 1];
  t.ok(warning.message.indexOf('Invalid "traceContinuationStrategy"') !== -1);

  opts.traceContinuationStrategy = TRACE_CONTINUATION_STRATEGY_RESTART;
  normalizeTraceContinuationStrategy(opts, [], defaults, logger);
  t.deepEqual(opts, {
    traceContinuationStrategy: TRACE_CONTINUATION_STRATEGY_RESTART,
  });

  t.end();
});

test('#normalizeContextManager()', function (t) {
  const logger = new MockLogger();
  const defaults = { contextManager: CONTEXT_MANAGER_PATCH };
  let opts;
  let lastWarning;

  opts = { contextManager: 'not-valid' };
  normalizeContextManager(opts, [], defaults, logger);
  // TODO: property gets deleted, check behaviour (assing undefined instead?)
  t.deepEqual(opts, {});
  lastWarning = logger.calls.pop();
  t.ok(lastWarning.message.indexOf('Invalid "contextManager"') !== -1);

  opts = { contextManager: CONTEXT_MANAGER_PATCH, asyncHooks: true };
  normalizeContextManager(opts, [], defaults, logger);
  t.deepEqual(opts, { contextManager: CONTEXT_MANAGER_PATCH });
  lastWarning = logger.calls.pop();
  t.ok(
    lastWarning.message.indexOf('the `asyncHooks` value will be ignored') !==
      -1,
  );

  opts = { asyncHooks: true };
  normalizeContextManager(opts, [], defaults, logger);
  t.deepEqual(opts, {});
  lastWarning = logger.calls.pop();
  t.ok(
    lastWarning.message.indexOf(
      '`asyncHooks: true` is the default behavior',
    ) !== -1,
  );

  opts = { asyncHooks: false };
  normalizeContextManager(opts, [], defaults, logger);
  t.deepEqual(opts, { contextManager: CONTEXT_MANAGER_PATCH });
  lastWarning = logger.calls.pop();
  t.ok(lastWarning.message.indexOf('use `contextManager: "patch"') !== -1);

  t.end();
});

test('#normalizeSpanStackTraceMinDuration()', function (t) {
  const logger = new MockLogger();
  const defaults = { spanStackTraceMinDuration: 10 };
  let opts;

  opts = {};
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: -1 });

  opts = {
    spanStackTraceMinDuration: 5,
    captureSpanStackTraces: false,
    spanFramesMinDuration: 4,
  };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: 5 });

  opts = { captureSpanStackTraces: false, spanFramesMinDuration: 4 };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: -1 });

  opts = { captureSpanStackTraces: true, spanFramesMinDuration: 0 };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: -1 });

  opts = { captureSpanStackTraces: true, spanFramesMinDuration: -1 };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: 0 });

  opts = { captureSpanStackTraces: true, spanFramesMinDuration: 5 };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: 5 });

  opts = { captureSpanStackTraces: true };
  normalizeSpanStackTraceMinDuration(opts, [], defaults, logger);
  t.deepEqual(opts, { spanStackTraceMinDuration: 10 / 1e3 });

  t.end();
});
