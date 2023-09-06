/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Run all "test/**/*.test.js" files, each in a separate process.
//
// This is the main entry point for running all tests locally, without setting
// up service dependencies (e.g. running a Redis to test redis instrumentation).
// To start service deps run `npm run docker:start`.
//
// Run `node test/test.js -h` for usage.

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var dashdash = require('dashdash');
var glob = require('glob');
var semver = require('semver');

// ---- support functions

function slugifyPath(f) {
  const illegalChars = /[^\w.-]/g;
  return f.replace(illegalChars, '-');
}

// Run a single test file.
function runTestFile(test, cb) {
  var args = [test.file];
  if (semver.gte(process.version, '12.0.0')) {
    args.unshift('--unhandled-rejections=strict');
  } else {
    args.unshift('--require', path.join(__dirname, '_promise_rejection.js'));
  }

  if (test.outDir) {
    const outFileName = path.join(test.outDir, slugifyPath(test.file) + '.tap');
    console.log(`running test: node ${args.join(' ')} > ${outFileName} 2&>1`);
    if (test.dryRun) {
      cb();
      return;
    }
    const outFile = fs.createWriteStream(outFileName);
    outFile.on('open', function () {
      var ps = spawn('node', args, {
        stdio: ['inherit', outFile, outFile],
      });
      ps.on('error', cb);
      ps.on('close', function (code) {
        outFile.close(function onClose(closeErr) {
          if (closeErr) {
            cb(closeErr);
            return;
          }

          // Dump the TAP content to stdout so it is in CI logs for debugging.
          process.stdout.write('\n' + fs.readFileSync(outFileName) + '\n');

          if (code !== 0) {
            const err = new Error('non-zero error code');
            err.code = 'ENONZERO';
            err.exitCode = code;
            cb(err);
          } else {
            cb();
          }
        });
      });
    });
  } else {
    console.log(`running test: node ${args.join(' ')}`);
    if (test.dryRun) {
      cb();
      return;
    }
    var ps = spawn('node', args, {
      stdio: 'inherit',
      env: test.env,
    });
    ps.on('error', cb);
    ps.on('close', function (code) {
      if (code !== 0) {
        const err = new Error('non-zero error code');
        err.code = 'ENONZERO';
        err.exitCode = code;
        return cb(err);
      }
      cb();
    });
  }
}

function series(tasks, cb) {
  var results = [];
  var pos = 0;

  function done(err, result) {
    if (err) return cb(err);
    results.push(result);

    if (++pos === tasks.length) {
      cb(null, results);
    } else {
      tasks[pos](done);
    }
  }

  setImmediate(tasks[pos], done);
}

function handlerBind(handler) {
  return function (task) {
    return handler.bind(null, task);
  };
}

function mapSeries(tasks, handler, cb) {
  series(tasks.map(handlerBind(handler)), cb);
}

// ---- mainline

var options = [
  {
    names: ['help', 'h'],
    type: 'bool',
    help: 'Print this help and exit.',
  },
  {
    names: ['dry-run', 'n'],
    type: 'bool',
    help: 'Dry-run. Just print what would be run.',
  },
  {
    names: ['output-dir', 'o'],
    type: 'string',
    help:
      'Directory to which to write .tap files. By default test ' +
      'output is written to stdout/stderr',
    helpArg: 'DIR',
  },
];

function main() {
  var parser = dashdash.createParser({ options });
  try {
    var opts = parser.parse(process.argv);
  } catch (e) {
    console.error('test/test.js: error: %s', e.message);
    process.exit(1);
  }

  // Use `parser.help()` for formatted options help.
  if (opts.help) {
    var help = parser.help().trimRight();
    console.log('usage: node test/test.js [OPTIONS]\n' + 'options:\n' + help);
    process.exit(0);
  }

  var tests = glob
    .sync(
      // Find all ".test.js" files, except those in "fixtures" dirs and in
      // "node_modules" dirs created for test packages.
      'test/**/*.test.js',
      { ignore: ['**/node_modules/**', '**/fixtures/**'] },
    )
    .map((file) => {
      return {
        file,
        dryRun: opts.dry_run,
        outDir: opts.output_dir,
      };
    });

  mapSeries(tests, runTestFile, function (err) {
    if (err) throw err;
  });
}

main();
