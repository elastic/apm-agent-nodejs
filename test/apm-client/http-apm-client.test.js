/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const test = require('tape')

const apmVersion = require('../../package').version

const { userAgentFromConf } = require('../../lib/apm-client/http-apm-client')

// Test User-Agent generation. It would be nice to also test against gherkin
// specs from apm.git.
// https://github.com/elastic/apm/blob/main/tests/agents/gherkin-specs/user_agent.feature
test('userAgentFromConf', t => {
  t.equal(userAgentFromConf({}),
    `apm-agent-nodejs/${apmVersion}`)
  t.equal(userAgentFromConf({ serviceName: 'foo' }),
    `apm-agent-nodejs/${apmVersion} (foo)`)
  t.equal(userAgentFromConf({ serviceName: 'foo', serviceVersion: '1.0.0' }),
    `apm-agent-nodejs/${apmVersion} (foo 1.0.0)`)
  // ISO-8859-1 characters are generally allowed.
  t.equal(userAgentFromConf({ serviceName: 'party', serviceVersion: '2021-été' }),
    `apm-agent-nodejs/${apmVersion} (party 2021-été)`)
  // Higher code points are replaced with `_`.
  t.equal(userAgentFromConf({ serviceName: 'freeze', serviceVersion: 'do you want to build a ☃ in my 🏰' }),
    `apm-agent-nodejs/${apmVersion} (freeze do you want to build a _ in my __)`)

  t.end()
})
