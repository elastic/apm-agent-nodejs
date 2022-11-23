/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test determination of the Agent install/start method used for the
// 'agent.installation.method' metadatum.

const { exec, execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const tape = require('tape')

const { MockAPMServer } = require('../_mock_apm_server')

const fixturesDir = path.join(__dirname, 'fixtures')

/**
 * Format the given data for passing to `t.comment()`.
 *
 * - t.comment() wipes leading whitespace. Prefix lines with '|' to avoid
 *   that, and to visually group a multi-line write.
 * - Drop ANSI escape characters, because those include control chars that
 *   are illegal in XML. When we convert TAP output to JUnit XML for
 *   Jenkins, then Jenkins complains about invalid XML.
 */
function formatForTComment (data) {
  // Match ANSI escapes (from https://stackoverflow.com/a/29497680/14444044).
  const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g /* eslint-disable-line no-control-regex */
  return '|' + data.toString('utf8')
    .replace(ANSI_RE, '')
    .trimRight().replace(/\n/g, '\n|')
}

// ---- tests

// We need to `npm install` for a first test run.
const haveNodeModules = fs.existsSync(path.join(fixturesDir, 'node_modules'))
tape.test(`setup: npm install (in ${fixturesDir})`, { skip: haveNodeModules }, t => {
  const startTime = Date.now()
  exec(
    'npm install',
    {
      cwd: fixturesDir
    },
    function (err, stdout, stderr) {
      t.error(err, `"npm install" succeeded (took ${(Date.now() - startTime) / 1000}s)`)
      if (err) {
        t.comment(`$ npm install\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`)
      }
      t.end()
    }
  )
})

// tape.test('require1', function (t) {
//   const script = 'require1.js'
//   const server = new MockAPMServer()
//   server.start(function (serverUrl) {
//     execFile(
//       process.execPath,
//       [script],
//       {
//         cwd: fixturesDir,
//         timeout: 10000, // sanity stop, 3s is sometimes too short for CI
//         env: Object.assign({}, process.env, {
//           ELASTIC_APM_SERVER_URL: serverUrl
//         })
//       },
//       function done (err, stdout, stderr) {
//         t.error(err, `fixtures/${script} errored out`)
//         if (err) {
//           t.comment(`$ node ${script}\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`)
//         }
//         // console.dir(server.events, { depth: 10 }) // XXX
//         const metadata = server.events[0].metadata
//         t.equal(metadata.service.agent.installation.method, 'require', 'agent.installation.method')
//         server.close()
//         t.end()
//       }
//     )
//   })
// })

tape.test('agent.installation.method fixtures', function (suite) {
  // Note: We do not test the "aws-lambda-layer" and "k8s-attacher" cases.
  // Testing these would require simulating an agent install to the special
  // paths used in those cases.
  var cases = [
    {
      script: 'require1.js',
      expectedMethod: 'require'
    },
    {
      script: 'require2.js',
      expectedMethod: 'require'
    },
    {
      script: 'import1.mjs',
      expectedMethod: 'import'
    },
    {
      script: 'import2.mjs',
      expectedMethod: 'import'
    },
    {
      script: 'hi.js',
      nodeOpts: ['-r', 'elastic-apm-node/start'],
      expectedMethod: 'preload'
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '-r elastic-apm-node/start'
      },
      expectedMethod: 'env-attach'
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '-r elastic-apm-node/start.js'
      },
      expectedMethod: 'env-attach'
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '--require=elastic-apm-node/start'
      },
      expectedMethod: 'env-attach'
    }
  ]

  cases.forEach(c => {
    const envStr = c.env ? Object.keys(c.env).map(k => `${k}="${c.env[k]}"`).join(' ') : ''
    suite.test(`${envStr} node ${(c.nodeOpts || []).join(' ')} ${c.script}`, t => {
      const server = new MockAPMServer()
      const args = c.nodeOpts || []
      args.push(c.script)
      server.start(function (serverUrl) {
        execFile(
          process.execPath,
          args,
          {
            cwd: fixturesDir,
            timeout: 10000, // sanity stop, 3s is sometimes too short for CI
            env: Object.assign(
              {},
              process.env,
              {
                ELASTIC_APM_SERVER_URL: serverUrl
              },
              c.env || {}
            )
          },
          function done (err, stdout, stderr) {
            t.error(err, 'ran successfully')
            // console.log('XXX stdout: ', stdout)
            if (err) {
              t.comment(`$ node ${c.script}\n-- stdout --\n${formatForTComment(stdout)}\n-- stderr --\n${formatForTComment(stderr)}\n--`)
            }
            const metadata = server.events[0].metadata
            t.equal(metadata.service.agent.installation.method, c.expectedMethod,
              `agent.installation.method === ${c.expectedMethod}`)
            server.close()
            t.end()
          }
        )
      })
    })
  })

  suite.end()
})
