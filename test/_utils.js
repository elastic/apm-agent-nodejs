/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A dumping ground for testing utility functions.

const fs = require('fs');
const { execFile } = require('child_process');

const moduleDetailsFromPath = require('module-details-from-path');
const semver = require('semver');

const { MockAPMServer } = require('./_mock_apm_server');

// Lookup the property "str" (given in dot-notation) in the object "obj".
// If the property isn't found, then `undefined` is returned.
function dottedLookup(obj, str) {
  var o = obj;
  var fields = str.split('.');
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (!Object.prototype.hasOwnProperty.call(o, field)) {
      return undefined;
    }
    o = o[field];
  }
  return o;
}

// Return the first element in the array that has a `key` with the given `val`;
// or if `val` is undefined, then the first element with any value for the given
// `key`.
//
// The `key` maybe a nested field given in dot-notation, for example:
// 'context.db.statement'.
function findObjInArray(arr, key, val) {
  let result = null;
  arr.some(function (elm) {
    const actualVal = dottedLookup(elm, key);
    if (val === undefined) {
      if (actualVal !== undefined) {
        result = elm;
        return true;
      }
    } else {
      if (actualVal === val) {
        result = elm;
        return true;
      }
    }
    return false;
  });
  return result;
}

// Same as `findObjInArray` but return all matches instead of just the first.
function findObjsInArray(arr, key, val) {
  return arr.filter(function (elm) {
    const actualVal = dottedLookup(elm, key);
    if (val === undefined) {
      if (actualVal !== undefined) {
        return true;
      }
    } else {
      if (actualVal === val) {
        return true;
      }
    }
    return false;
  });
}

// "Safely" get the version of the given package, if possible. Otherwise return
// null.
//
// Here "safely" means avoiding `require("$packageName/package.json")` because
// that can fail if the package uses an old form of "exports"
// (e.g. https://github.com/elastic/apm-agent-nodejs/issues/2350).
function safeGetPackageVersion(packageName) {
  let file;
  try {
    file = require.resolve(packageName);
  } catch (_err) {
    return null;
  }

  // Use the same logic as require-in-the-middle for finding the 'basedir' of
  // the package from `file`.
  const details = moduleDetailsFromPath(file);
  if (!details) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(details.basedir + '/package.json'))
      .version;
  } catch (_err) {
    return null;
  }
}

// Match ANSI escapes (from https://stackoverflow.com/a/29497680/14444044).
const ANSI_RE =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; /* eslint-disable-line no-control-regex */

/**
 * Format the given data for passing to `t.comment()`.
 *
 * - t.comment() wipes leading whitespace. Prefix lines with '|' to avoid
 *   that, and to visually group a multi-line write.
 * - Drop ANSI escape characters, because those include control chars that
 *   are illegal in XML. When we convert TAP output to JUnit XML for
 *   Jenkins, then Jenkins complains about invalid XML. `FORCE_COLOR=0`
 *   can be used to disable ANSI escapes in `next dev`'s usage of chalk,
 *   but not in its coloured exception output.
 */
function formatForTComment(data) {
  return (
    data
      .toString('utf8')
      .replace(ANSI_RE, '')
      .trimRight()
      .replace(/\r?\n/g, '\n|') + '\n'
  );
}

/**
 * This returns a new array of APM events, with "metadata" entries removed
 * (because they have no timestamp) and other events sorted by "timestamp".
 *
 * @param {Array} events An array of APM server intake events, e.g. from
 *    `MockAPMServer().events`
 * @returns {Array}
 */
function sortApmEvents(events) {
  return events
    .filter((e) => !e.metadata)
    .sort((a, b) => {
      const aTimestamp = (a.transaction || a.span || a.error || {}).timestamp;
      const bTimestamp = (b.transaction || b.span || b.error || {}).timestamp;
      return aTimestamp < bTimestamp ? -1 : 1;
    });
}

function quoteArg(a) {
  if (a.includes("'")) {
    return "'" + a.replace("'", "'\\''") + "'";
  } else if (a.includes('"') || a.includes('$')) {
    return "'" + a + "'";
  } else if (a.includes(' ')) {
    return '"' + a + '"';
  } else {
    return a;
  }
}

function quoteArgv(argv) {
  return argv.map(quoteArg).join(' ');
}

function quoteEnv(env) {
  if (!env) {
    return '';
  }
  return Object.keys(env)
    .map((k) => {
      return `${k}=${quoteArg(env[k])}`;
    })
    .join(' ');
}

/**
 * Run a series of "test fixture" tests. Each test fixture is an object that
 * defines a Node.js script to run, how to run it (arguments, env, cwd),
 * and function(s) to check the results after it is run. This runner starts
 * a MockAPMServer for the script to use.
 *
 * Assuming a "fixtures/hello.js" script like this:
 *
 *    const apm = require('../../../../').start()
 *    apm.startTransaction('manual')
 *    console.log('hi')
 *    apm.endTransaction('manual')
 *
 * a simple example is:
 *
 *    const testFixtures = [
 *      {
 *        script: 'fixtures/hello.js',
 *        cwd: __dirname,
 *        verbose: true,
 *        checkApmServer: (t, apmServer) => {
 *          t.ok(apmServer.events[0].metadata, 'metadata')
 *          const events = sortApmEvents(apmServer.events)
 *          t.equal(events.length, 1)
 *          t.ok(events[0].transaction, 'transaction')
 *        }
 *      }
 *    ]
 *    test('module fixtures', suite => {
 *      runTestFixtures(suite, testFixtures)
 *      suite.end()
 *    })
 *
 * Each `testFixtures` script will be executed with a configured
 * ELASTIC_APM_SERVER_URL. By default it asserts that the script exits
 * successfully.
 *
 * See the options below for controlling how the script is run, how to
 * check the script output, whether to run or skip with the current node
 * version, etc.
 *
 * @typedef {Object} TestFixture
 * @property {string} script The script path to execute.
 * @property {string} [name] The name of the test. Defaults to `script`.
 * @property {string} [cwd] Typically this is `__dirname`, then `script` can be
 *    relative to the test file.
 * @property {number} [timeout] A timeout number of milliseconds for the script
 *    to execute. Default 10000.
 * @property {number} [maxBuffer] A maxBuffer to use for the exec.
 * @property {Object<String, String>} [env] Any custom envvars, e.g. `{NODE_OPTIONS:...}`.
 * @property {Array<String>} [nodeArgv] E.g. `--experimental-loader=...`.
 * @property {Array<String>} [scriptArgv]
 * @property {boolean} [noConvenienceConfig] By default this runner sets the
 *    `ELASTIC_APM_` envvars to disable central config, cloud metadata lookup,
 *    metrics, and the capturing of exceptions. The intent is to have a quieter
 *    and more helpful default for writing tests. Set this to `false` to disable
 *    setting those envvars.
 * @property {boolean} [verbose] Set to `true` to include `t.comment()`s showing
 *    the command run and its output. This can be helpful to run the script
 *    manually for dev/debugging.
 * @property {Object} [testOpts] Additional tape test opts, if any. https://github.com/ljharb/tape#testname-opts-cb
 * @property {Map<string,string>} [versionRanges] A mapping of required version
 *    ranges for either "node" or a given module name. If current versions don't
 *    satisfy, then the test will be skipped. E.g. this is common for ESM tests:
 *        versionRanges: {
 *          node: NODE_VER_RANGE_IITM
 *        }
 * @property {function} [checkScriptResult] Check the exit and output of the
 *    script: `checkScriptResult(t, err, stdout, stderr)`. If not provided, by
 *    default it will be asserted that the script exited successfully.
 * @property {function} [checkApmServer] Check the results received by the mock
 *    APM Server. `checkApmServer(t, apmServer)`
 *
 * @param {import('@types/tape').TestCase} suite
 * @param {Array<TestFixture>} testFixtures
 */
function runTestFixtures(suite, testFixtures) {
  const convenienceConfig = {
    // Silence some features of the agent that can make testing
    // noisier and less convenient.
    ELASTIC_APM_CENTRAL_CONFIG: 'false',
    ELASTIC_APM_CLOUD_PROVIDER: 'none',
    ELASTIC_APM_METRICS_INTERVAL: '0s',
    ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS: 'true',
  };
  testFixtures.forEach((tf) => {
    const testName = tf.name ? `${tf.name} (${tf.script})` : tf.script;
    const testOpts = Object.assign({}, tf.testOpts);
    suite.test(testName, testOpts, (t) => {
      // Handle "tf.versionRanges"-based skips here, because `tape` doesn't
      // print any message for `testOpts.skip`.
      if (tf.versionRanges) {
        for (const name in tf.versionRanges) {
          const ver =
            name === 'node' ? process.version : safeGetPackageVersion(name);
          if (!semver.satisfies(ver, tf.versionRanges[name])) {
            t.comment(
              `SKIP ${name} ${ver} is not supported by this fixture (requires: ${tf.versionRanges[name]})`,
            );
            t.end();
            return;
          }
        }
      }

      const apmServer = new MockAPMServer();
      apmServer.start(function (serverUrl) {
        const argv = (tf.nodeArgv || [])
          .concat([tf.script])
          .concat(tf.scriptArgv || []);
        const cwd = tf.cwd || process.cwd();
        if (tf.verbose) {
          t.comment(
            `running: (cd "${cwd}" && ${quoteEnv(tf.env)} node ${quoteArgv(
              argv,
            )})`,
          );
        }
        const start = Date.now();
        execFile(
          process.execPath,
          argv,
          {
            cwd,
            timeout: tf.timeout || 10000, // guard on hang, 3s is sometimes too short for CI
            env: Object.assign(
              {},
              process.env,
              tf.noConvenienceConfig ? {} : convenienceConfig,
              {
                ELASTIC_APM_SERVER_URL: serverUrl,
              },
              tf.env,
            ),
            maxBuffer: tf.maxBuffer,
          },
          async function done(err, stdout, stderr) {
            if (tf.verbose) {
              t.comment(`elapsed: ${(Date.now() - start) / 1000}s`);
              if (err) {
                t.comment(`err:\n|${formatForTComment(err)}`);
              }
              if (stdout) {
                t.comment(`stdout:\n|${formatForTComment(stdout)}`);
              } else {
                t.comment('stdout: <empty>');
              }
              if (stderr) {
                t.comment(`stderr:\n|${formatForTComment(stderr)}`);
              } else {
                t.comment('stderr: <empty>');
              }
            }
            if (tf.checkScriptResult) {
              await tf.checkScriptResult(t, err, stdout, stderr);
            } else {
              t.error(err, `${tf.script} exited successfully: err=${err}`);
              if (err) {
                if (!tf.verbose) {
                  t.comment(`stdout:\n|${formatForTComment(stdout)}`);
                  t.comment(`stderr:\n|${formatForTComment(stderr)}`);
                }
              }
            }
            if (tf.checkApmServer) {
              if (!tf.checkScriptResult && err) {
                t.comment('skip checkApmServer because script errored out');
              } else {
                await tf.checkApmServer(t, apmServer);
              }
            }
            apmServer.close();
            t.end();
          },
        );
      });
    });
  });
}

module.exports = {
  dottedLookup,
  findObjInArray,
  findObjsInArray,
  formatForTComment,
  safeGetPackageVersion,
  sortApmEvents,
  runTestFixtures,
};
