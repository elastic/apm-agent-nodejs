/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

const semver = require('semver');
const graphqlVer = require('graphql/package.json').version;
if (
  semver.satisfies(graphqlVer, '>=16') &&
  !semver.satisfies(process.version, '>=12')
) {
  console.log(
    `# SKIP graphql@${graphqlVer} is incompatible with node ${process.version}`,
  );
  process.exit();
}

var graphql = require('graphql');
var test = require('tape');

var mockClient = require('../../_mock_http_client');

// See explanation of these in "lib/instrumentation/modules/graphql.js".
const onlySupportsPositionalArgs = semver.lt(graphqlVer, '0.10.0');
const onlySupportsSingleArg = semver.gte(graphqlVer, '16.0.0');

if (!onlySupportsSingleArg) {
  // graphql@16 dropped support for positional arguments.
  test('graphql.graphql(...) - positional args', function (t) {
    resetAgent(done(t));

    var schema = graphql.buildSchema('type Query { hello: String }');
    var rootValue = {
      hello() {
        return 'Hello world!';
      },
    };
    var query = '{ hello }';

    agent.startTransaction('foo');

    graphql.graphql(schema, query, rootValue).then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .graphql().then(...)');
      agent.endTransaction();
      t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after .graphql(...)',
    );
  });
}

if (!onlySupportsPositionalArgs) {
  test('graphql.graphql(...) - single GraphQLArgs arg', function (t) {
    resetAgent(done(t));

    var schema = graphql.buildSchema('type Query { hello: String }');
    var rootValue = {
      hello() {
        return 'Hello world!';
      },
    };
    var query = '{ hello }';

    agent.startTransaction('foo');

    graphql
      .graphql({ schema, source: query, rootValue })
      .then(function (response) {
        t.ok(agent.currentSpan === null, 'no currentSpan .graphql().then(...)');
        agent.endTransaction();
        t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after .graphql(...)',
    );
  });
}

test('graphql.graphql - invalid query', function (t) {
  resetAgent(done(t, 'Unknown Query'));

  var schema = graphql.buildSchema('type Query { hello: String }');
  var rootValue = {
    hello() {
      return 'Hello world!';
    },
  };
  var query = '{ hello';

  agent.startTransaction('foo');

  graphql
    .graphql(...buildGraphqlArgs({ schema, source: query, rootValue }))
    .then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .graphql().then(...)');
      agent.endTransaction();
      t.deepEqual(Object.keys(response), ['errors']);
      t.strictEqual(response.errors.length, 1, 'should have one error');
      t.ok(
        response.errors[0].message.indexOf('Syntax Error') !== -1,
        'should return a sytax error',
      );
      agent.flush();
    });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after .graphql(...)',
  );
});

test('graphql.graphql - transaction ended', function (t) {
  t.plan(7);

  resetAgent(1, function (data) {
    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, 0);

    var trans = data.transactions[0];

    t.strictEqual(trans.name, 'foo');
    t.strictEqual(trans.type, 'custom');
  });

  var schema = graphql.buildSchema('type Query { hello: String }');
  var rootValue = {
    hello() {
      return 'Hello world!';
    },
  };
  var query = '{ hello }';

  agent.startTransaction('foo').end();

  graphql
    .graphql(...buildGraphqlArgs({ schema, source: query, rootValue }))
    .then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .graphql().then(...)');
      t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
    });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after .graphql(...)',
  );
});

if (!onlySupportsSingleArg) {
  // graphql@16 dropped support for positional arguments.
  test('graphql.execute(...) - positional args', function (t) {
    resetAgent(done(t));

    var schema = graphql.buildSchema('type Query { hello: String }');
    var rootValue = {
      hello() {
        return Promise.resolve('Hello world!');
      },
    };
    var query = '{ hello }';
    var source = new graphql.Source(query);
    var documentAST = graphql.parse(source);

    agent.startTransaction('foo');

    graphql.execute(schema, documentAST, rootValue).then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .execute().then(...)');
      agent.endTransaction();
      t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after .execute(...)',
    );
  });
}

test('graphql.execute - transaction ended', function (t) {
  t.plan(7);

  resetAgent(1, function (data) {
    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, 0);

    var trans = data.transactions[0];

    t.strictEqual(trans.name, 'foo');
    t.strictEqual(trans.type, 'custom');
  });

  var schema = graphql.buildSchema('type Query { hello: String }');
  var rootValue = {
    hello() {
      return Promise.resolve('Hello world!');
    },
  };
  var query = '{ hello }';
  var source = new graphql.Source(query);
  var document = graphql.parse(source);

  agent.startTransaction('foo').end();

  graphql
    .execute(...buildExecuteArgs({ schema, document, rootValue }))
    .then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .execute().then(...)');
      t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
    });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after .execute(...)',
  );
});

if (!onlySupportsPositionalArgs) {
  test('graphql.execute(...) - single ExecutionArgs arg', function (t) {
    resetAgent(done(t));

    var schema = graphql.buildSchema('type Query { hello: String }');
    var rootValue = {
      hello() {
        return Promise.resolve('Hello world!');
      },
    };
    var query = '{ hello }';
    var source = new graphql.Source(query);
    var documentAST = graphql.parse(source);
    var args = {
      schema,
      document: documentAST,
      rootValue,
    };

    agent.startTransaction('foo');

    graphql.execute(args).then(function (response) {
      t.ok(agent.currentSpan === null, 'no currentSpan .execute().then(...)');
      agent.endTransaction();
      t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after .execute(...)',
    );
  });
}

if (semver.satisfies(graphqlVer, '>=0.12')) {
  test('graphql.execute sync', function (t) {
    resetAgent(done(t));

    var schema = graphql.buildSchema('type Query { hello: String }');
    var rootValue = {
      hello() {
        return 'Hello world!';
      },
    };
    var query = '{ hello }';
    var source = new graphql.Source(query);
    var document = graphql.parse(source);

    agent.startTransaction('foo');

    var response = graphql.execute(
      ...buildExecuteArgs({ schema, document, rootValue }),
    );
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after .execute(...)',
    );

    agent.endTransaction();
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } });
    agent.flush();
  });
}

function done(t, spanNameSuffix) {
  spanNameSuffix = spanNameSuffix || 'hello';

  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, 1);

    var trans = data.transactions[0];
    var span = data.spans[0];

    t.strictEqual(trans.name, 'foo');
    t.strictEqual(trans.type, 'custom');
    t.strictEqual(span.name, 'GraphQL: ' + spanNameSuffix);
    t.strictEqual(span.type, 'db');
    t.strictEqual(span.subtype, 'graphql');
    t.strictEqual(span.action, 'execute');

    var offset = span.timestamp - trans.timestamp;
    t.ok(offset + span.duration * 1000 < trans.duration * 1000);

    t.end();
  };
}

// Take the modern (single object argument) calling signature for
// `graphql.graphql()` and return an arguments array that can be used to
// call it with whatever the appropriate call signature is for the current
// graphql version.
function buildGraphqlArgs(args) {
  if (onlySupportsPositionalArgs) {
    const {
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
      typeResolver,
    } = args;
    return [
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
      typeResolver,
    ].filter((a) => a !== undefined);
  } else {
    return [args];
  }
}

// Take the modern (single object argument) calling signature for
// `graphql.execute()` and return an arguments array that can be used to
// call it with whatever the appropriate call signature is for the current
// graphql version.
function buildExecuteArgs(args) {
  if (onlySupportsPositionalArgs) {
    const { schema, document, variableValues, rootValue } = args;
    return [schema, document, variableValues, rootValue].filter(
      (a) => a !== undefined,
    );
  } else {
    return [args];
  }
}

function resetAgent(expected, cb) {
  if (typeof executed === 'function') return resetAgent(2, expected);
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(expected, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
