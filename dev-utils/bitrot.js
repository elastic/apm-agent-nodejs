#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Compare .tav.yml, docs/supported-technologies.asciidoc, and the current
// releases of modules instrumented by the Elastic Node.js APM agent to:
// - list inconsistencies between TAV-tested and "supported", and
// - list new releases of modules that the agent doesn't yet support
//
// Usage:
//      node dev-utils/bitrot.js [MODULE-NAME...]

const { execSync } = require('child_process');
const fs = require('fs');

const dashdash = require('dashdash');
const ecsFormat = require('@elastic/ecs-pino-format');
const pino = require('pino');
const semver = require('semver');
const yaml = require('js-yaml');

let log = null;
let rotCount = 0;

const EXCUSE_FROM_SUPPORTED_TECHNOLOGIES_DOC = {
  '@elastic/elasticsearch-canary': true, // we test this for advance warning for '@elastic/elasticsearch', but don't explicitly support the canary versions
  'body-parser': true, // instrumented to support express
  finalhandler: true, // instrumented to support express
  got: true, // got@12 is pure ESM so we state support up to got@11 only
  'mimic-response': true, // we instrument a single old version to indirectly support an old version of 'got'
  mongojs: true, // last release was in 2019, we aren't going to add effort to this module now
  '': null,
};
const EXCUSE_FROM_TAV = {
  '@elastic/elasticsearch-canary': true,
  got: true, // got@12 is pure ESM so we state support up to got@11 only
  hapi: true, // we deprecated 'hapi' (in favour of '@hapi/hapi')
  jade: true, // we deprecated 'jade' (in favour of 'pug')
  'mimic-response': true, // we instrument a single old version to indirectly support an old version of 'got'
  mongojs: true, // last release was in 2019, we aren't going to add effort to this module now
  '': null,
};

// ---- caching

const gCachePath = '/tmp/apm-agent-nodejs-bitrot.cache.json';
let gCache = null;

function ensureCacheLoaded(ns) {
  if (gCache === null) {
    try {
      gCache = JSON.parse(fs.readFileSync(gCachePath));
    } catch (loadErr) {
      log.debug(loadErr, 'could not load cache');
      gCache = {};
    }
  }
  if (!(ns in gCache)) {
    gCache[ns] = {};
  }
  return gCache[ns];
}

function saveCache() {
  if (gCache !== null) {
    fs.writeFileSync(gCachePath, JSON.stringify(gCache, null, 2));
  }
}

// ---- minimal ANSI styling support (from bunyan)

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Suggested colors (some are unreadable in common cases):
// - Good: cyan, yellow (limited use, poor visibility on white background),
//   bold, green, magenta, red
// - Bad: blue (not visible on cmd.exe), grey (same color as background on
//   Solarized Dark theme from <https://github.com/altercation/solarized>, see
//   issue #160)
var colors = {
  bold: [1, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  white: [37, 39],
  grey: [90, 39],
  black: [30, 39],
  blue: [34, 39],
  cyan: [36, 39],
  green: [32, 39],
  magenta: [35, 39],
  red: [31, 39],
  yellow: [33, 39],
};

function stylizeWithColor(str, color) {
  if (!str) {
    return '';
  }
  var codes = colors[color];
  if (codes) {
    return '\x1B[' + codes[0] + 'm' + str + '\x1B[' + codes[1] + 'm';
  } else {
    return str;
  }
}

function stylizeWithoutColor(str, color) {
  return str;
}

let stylize = stylizeWithColor;

// ---- support functions

function rot(moduleName, s) {
  rotCount++;
  console.log(`${stylize(moduleName, 'bold')} bitrot: ${s}`);
}

// Process docs/supported-technologies.asciidoc into an array of:
//      {name: '<module name>', versions: '<version range>'}
//
// Note that the tables in this file don't seem to follow the AsciiDoc table
// syntax described here:
// https://docs.asciidoctor.org/asciidoc/latest/tables/build-a-basic-table/
// I don't know why the difference. This parsing supports just the limited form
// I see in supported-technologies.asciidoc.
function loadSupportedDoc() {
  const docPath = 'docs/supported-technologies.asciidoc';
  var html = fs.readFileSync(docPath, 'utf8');
  var rows = [];
  var state = null; // null | 'thead' | 'tbody'
  html.split(/\n/g).forEach(function (line) {
    if (!line.startsWith('|')) {
      // no op
    } else if (state === null) {
      if (line.startsWith('|===')) {
        state = 'thead';
      }
    } else if (state === 'thead') {
      state = 'tbody';
    } else if (state === 'tbody') {
      if (line.startsWith('|===')) {
        state = null;
      } else {
        // Examples:
        //      |https://www.npmjs.com/package/generic-pool[generic-pool] | ^2.0.0 \|\| ^3.1.0 |Used by a lot of ...
        //      |https://www.npmjs.com/package/bluebird[bluebird] |>=2.0.0 <4.0.0 |
        var escapePlaceholder = '6B1EC7E1-B273-40E9-94C4-197A59B55E24';
        var cells = line
          .trim()
          .slice(1) // remove leading '|'
          .replace(/\\\|/g, escapePlaceholder)
          .split(/\s*\|\s*/g)
          .map((c) => c.replace(new RegExp(escapePlaceholder, 'g'), '|'))
          .filter((c) => c.length > 0);
        rows.push(cells);
      }
    }
  });
  // log.trace({rows}, `${docPath} table rows`)

  // The tables in supported-technologies.asciidoc have the module
  // name in the first column, and version range in the second. There
  // are two forms of the first cell to parse:
  //      [ '<<hapi,hapi>>', '>=9.0.0 <19.0.0' ],
  //      [ '<<hapi,@hapi/hapi>>', '>=17.9.0 <20.0.0' ],
  //      [ '<<koa,Koa>> via koa-router or @koa/router', '>=5.2.0 <10.0.0' ],
  //      [ '<<restify,Restify>>', '>=5.2.0' ],
  //      [ '<<lambda,AWS Lambda>>', 'N/A' ],
  //      ['https://www.npmjs.com/package/jade[jade]', '>=0.5.6']
  //
  // The entries in the "Frameworks" table use the names of internal links in
  // these docs. The anchor name is *sometimes* the same name as the npm
  // module, but sometimes not.
  var results = [];
  let match;
  rows.forEach(function (row) {
    if (row[1] === 'N/A') {
      // skip
    } else if (row[0].includes('<<')) {
      match = /^\s*<<([\w-]+),(.*?)>>/.exec(row[0]);
      if (!match) {
        throw new Error(
          `could not parse this table cell text from docs/supported-technologies.asciidoc: ${JSON.stringify(
            row[0],
          )}`,
        );
      }
      var moduleNames;
      if (match[1] === 'nextjs') {
        moduleNames = ['next'];
      } else if (match[2] === '@hapi/hapi') {
        moduleNames = [match[2]];
      } else if (match[2] === '@opentelemetry/api') {
        moduleNames = [match[2]];
      } else if (match[1] === 'koa') {
        moduleNames = ['koa-router', '@koa/router'];
      } else if (match[1] === 'azure-functions') {
        moduleNames = []; // Azure Functions compat isn't about an NPM package version.
      } else {
        moduleNames = [match[1]];
      }
      moduleNames.forEach((n) => {
        results.push({ name: n, versions: row[1] });
      });
    } else {
      match = /^https:\/\/.*\[(.*)\]$/.exec(row[0].trim());
      if (!match) {
        throw new Error(
          `could not parse this table cell text from docs/supported-technologies.asciidoc: ${JSON.stringify(
            row[0],
          )}`,
        );
      }
      results.push({ name: match[1], versions: row[1] });
    }
  });
  return results;
}

function getNpmInfo(name) {
  const CACHE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const cache = ensureCacheLoaded('npmInfo');
  const cacheEntry = cache[name];
  if (cacheEntry) {
    if (cacheEntry.timestamp + CACHE_TIMEOUT_MS > Date.now()) {
      return cacheEntry.value;
    } else {
      delete cache[name];
    }
  }

  // Limited security guard on exec'ing given `name`.
  const PKG_NAME_RE = /^(@[\w_.-]+\/)?([\w_.-]+)$/;
  if (!PKG_NAME_RE.test(name)) {
    throw new Error(
      `${JSON.stringify(name)} does not look like a valid npm package name`,
    );
  }

  const stdout = execSync(`npm info -j "${name}"`);
  const npmInfo = JSON.parse(stdout);

  cache[name] = {
    timestamp: Date.now(),
    value: npmInfo,
  };
  saveCache();
  return npmInfo;
}

function bitrot(moduleNames) {
  log.debug({ moduleNames }, 'bitrot');
  var tavYmls = [
    yaml.load(fs.readFileSync('.tav.yml', 'utf8')),
    yaml.load(fs.readFileSync('./test/opentelemetry-bridge/.tav.yml', 'utf8')),
    yaml.load(
      fs.readFileSync('./test/opentelemetry-metrics/fixtures/.tav.yml', 'utf8'),
    ),
    yaml.load(
      fs.readFileSync(
        'test/instrumentation/modules/next/a-nextjs-app/.tav.yml',
        'utf8',
      ),
    ),
  ];
  var supported = loadSupportedDoc();

  // Merge into one data structure we can iterate through.
  var rangesFromName = {};
  var ensureKey = (name) => {
    if (!(name in rangesFromName)) {
      rangesFromName[name] = { tavRanges: [], supRanges: [] };
    }
  };
  tavYmls.forEach((tavYml) => {
    for (const [label, tavInfo] of Object.entries(tavYml)) {
      var name = tavInfo.name || label;
      ensureKey(name);
      rangesFromName[name].tavRanges.push(tavInfo.versions);
    }
  });
  for (const supInfo of supported) {
    ensureKey(supInfo.name);
    rangesFromName[supInfo.name].supRanges.push(supInfo.versions);
  }

  // Reduce to `moduleNames` if given.
  if (moduleNames && moduleNames.length > 0) {
    var allNames = Object.keys(rangesFromName);
    moduleNames.forEach((name) => {
      if (!(name in rangesFromName)) {
        throw new Error(
          `unknown module name: ${name} (known module names: ${allNames.join(
            ', ',
          )})`,
        );
      }
    });
    allNames.forEach((name) => {
      if (!moduleNames.includes(name)) {
        delete rangesFromName[name];
      }
    });
  }
  log.debug({ rangesFromName }, 'rangesFromName');

  // Check each module name.
  var namesToCheck = Object.keys(rangesFromName).sort();
  namesToCheck.forEach((name) => {
    var npmInfo = getNpmInfo(name);
    log.trace(
      { name, 'dist-tags': npmInfo['dist-tags'], time: npmInfo.time },
      'npmInfo',
    );

    // If the current latest version is in the supported and
    // tav ranges, then all is good.
    var latest = npmInfo['dist-tags'].latest;
    var tavGood = false;
    if (EXCUSE_FROM_TAV[name]) {
      tavGood = true;
    } else {
      for (const range of rangesFromName[name].tavRanges) {
        if (semver.satisfies(latest, range, { includePrerelease: true })) {
          tavGood = true;
          break;
        }
      }
    }
    var supGood = false;
    if (EXCUSE_FROM_SUPPORTED_TECHNOLOGIES_DOC[name]) {
      supGood = true;
    } else {
      for (const range of rangesFromName[name].supRanges) {
        if (semver.satisfies(latest, range, { includePrerelease: true })) {
          supGood = true;
          break;
        }
      }
    }
    if (tavGood && supGood) {
      log.debug(
        `latest ${name}@${latest} is in tav and supported ranges (a good thing)`,
      );
      return;
    }
    var issues = [];
    if (!tavGood) {
      issues.push(
        `is not in .tav.yml ranges (${rangesFromName[name].tavRanges.join(
          ', ',
        )})`,
      );
    }
    if (!supGood) {
      issues.push(
        `is not in supported-technologies.asciidoc ranges (${rangesFromName[
          name
        ].supRanges.join(', ')})`,
      );
    }
    rot(
      name,
      `latest ${name}@${latest} (released ${
        npmInfo.time[latest].split('T')[0]
      }): ${issues.join(', ')}`,
    );
  });
}

// ---- mainline

const options = [
  {
    names: ['verbose', 'v'],
    type: 'bool',
    help: 'Verbose log output. (Pipe to `ecslog` to format.)',
  },
  {
    names: ['help', 'h'],
    type: 'bool',
    help: 'Print this help and exit.',
  },
];

function main(argv) {
  var parser = dashdash.createParser({ options });
  try {
    var opts = parser.parse(argv);
  } catch (e) {
    console.error('help: error: %s', e.message);
    process.exit(1);
  }
  if (opts.help) {
    var help = parser.help().trimRight();
    process.stdout.write(`Synopsis:
    dev-utils/bitrot.js [OPTIONS]

Description:
    Compare ".tav.yml", "docs/supported-technologies.asciidoc"
    and the current releases of instrumented modules to list
    new releases that are not (yet) supported by the APM agent.

Options:
${help}

Exit status:
    0    No bitrot was found.
    1    There was an unexpected error.
    3    Bitrot was found.
`);
    process.exit(0);
  }

  stylize = process.stdout.isTTY ? stylizeWithColor : stylizeWithoutColor;
  log = pino(
    {
      name: 'bitrot',
      base: {}, // Don't want pid and hostname fields.
      level: opts.verbose ? 'trace' : 'warn',
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      ...ecsFormat({ apmIntegration: false }),
    },
    pino.destination(1),
  );

  const moduleNames = opts._args;
  try {
    bitrot(moduleNames);
  } catch (err) {
    log.debug(err);
    console.error(`bitrot: error: ${err.message}`);
    process.exit(1);
  }

  if (rotCount > 0) {
    process.exit(3);
  }
}

if (require.main === module) {
  main(process.argv);
}
