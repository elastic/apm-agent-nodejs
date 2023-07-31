/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

var apmVersion = require('../../package').version;

const Agent = require('../../lib/agent');
const { HttpApmClient } = require('../../lib/apm-client/http-apm-client');
const { NoopApmClient } = require('../../lib/apm-client/noop-apm-client');
const {
  createApmClient,
  userAgentFromConf,
} = require('../../lib/apm-client/apm-client');

test('#createApmClient - disableSend', (t) => {
  const agent = new Agent();
  const transport = createApmClient({ disableSend: true }, agent);

  t.ok(transport instanceof NoopApmClient, 'transport should be NoopApmClient');
  agent.destroy();
  t.end();
});

test('#createApmClient - contextPropagationOnly', (t) => {
  const agent = new Agent();
  const transport = createApmClient({ contextPropagationOnly: true }, agent);

  t.ok(
    transport instanceof NoopApmClient,
    'transport should be a NoopApmClient instance',
  );
  agent.destroy();
  t.end();
});

test('#createApmClient - customClient', (t) => {
  const agent = new Agent();
  const customClient = {};
  const transport = createApmClient(
    {
      transport: function () {
        return customClient;
      },
    },
    agent,
  );

  t.ok(
    transport === customClient,
    'transport should be resolved from config property',
  );
  agent.destroy();
  t.end();
});

test('#createApmClient - elastic APM Transport', (t) => {
  const agent = new Agent();
  const transport = createApmClient(
    {
      serviceName: 'test-agent',
      centralConfig: false,
      cloudProvider: 'none',
    },
    agent,
  );

  t.ok(
    transport instanceof HttpApmClient,
    'transport should be an ElasticAPMHttpClient instance',
  );
  agent.destroy();
  t.end();
});

// Test User-Agent generation. It would be nice to also test against gherkin
// specs from apm.git.
// https://github.com/elastic/apm/blob/main/tests/agents/gherkin-specs/user_agent.feature
test('userAgentFromConf', (t) => {
  t.equal(userAgentFromConf({}), `apm-agent-nodejs/${apmVersion}`);
  t.equal(
    userAgentFromConf({ serviceName: 'foo' }),
    `apm-agent-nodejs/${apmVersion} (foo)`,
  );
  t.equal(
    userAgentFromConf({ serviceName: 'foo', serviceVersion: '1.0.0' }),
    `apm-agent-nodejs/${apmVersion} (foo 1.0.0)`,
  );
  // ISO-8859-1 characters are generally allowed.
  t.equal(
    userAgentFromConf({ serviceName: 'party', serviceVersion: '2021-été' }),
    `apm-agent-nodejs/${apmVersion} (party 2021-été)`,
  );
  // Higher code points are replaced with `_`.
  t.equal(
    userAgentFromConf({
      serviceName: 'freeze',
      serviceVersion: 'do you want to build a ☃ in my 🏰',
    }),
    `apm-agent-nodejs/${apmVersion} (freeze do you want to build a _ in my __)`,
  );

  t.end();
});
