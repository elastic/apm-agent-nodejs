/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const globals = require('globals');
const eslintJs = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const licenseHeaderPlugin = require('eslint-plugin-license-header');
const nPlugin = require('eslint-plugin-n');
const promisePlugin = require('eslint-plugin-promise');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: false, // not present in node globals (readonly)
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true, // to parse nextjs files, see TODO comment below
        },
      },
    },
    plugins: {
      'license-header': licenseHeaderPlugin,
      n: nPlugin,
      promise: promisePlugin,
      import: importPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': ['error'],
      'license-header/header': ['error', './dev-utils/license-header.js'],
      // Restoring some config from standardjs that we want to maintain at least
      // for now -- to assist with transition to prettier.
      // TODO: remove these ?????
      'no-unused-vars': [
        // See taav for possible better 'no-unused-vars' rule.
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
          vars: 'all',
        },
      ],
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
      'no-constant-condition': [
        'error',
        {
          checkLoops: false,
        },
      ],
      'n/handle-callback-err': ['error', '^(err|error)$'],
      'n/no-callback-literal': ['error'],
      'n/no-deprecated-api': ['error'],
      'n/no-exports-assign': ['error'],
      'n/no-new-require': ['error'],
      'n/no-path-concat': ['error'],
      'n/process-exit-as-throw': ['error'],
      'promise/param-names': ['error'],
      // Undo this config from eslint:recommended for now (standardjs didn't have it.)
      'require-yield': ['off'],
      'import/export': 'error',
      'import/first': 'error',
      'import/no-absolute-path': [
        'error',
        { esmodule: true, commonjs: true, amd: false },
      ],
      'import/no-duplicates': 'error',
      'import/no-named-default': 'error',
      'import/no-webpack-loader-syntax': 'error',
      // Some defaults have changed in v9
      'dot-notation': ['error'],
      'new-cap': ['error', { capIsNew: false }],
      'no-eval': ['error', { allowIndirect: true }],
      'no-new': ['error'],
      yoda: ['error'],
      'valid-typeof': ['error'],
    },
    ignores: [
      // NOTE: Now ignore patters must be in glob expressions
      '**/*.example.js', // a pattern for uncommited local dev files to avoid linting
      '**/*.example.mjs', // a pattern for uncommited local dev files to avoid linting
      '.nyc_output/**',
      'build/**',
      'node_modules/**',
      '**/elastic-apm-node.js',
      'examples/esbuild/dist/**',
      'examples/typescript/dist/**',
      // TODO: see comment below about JSX syntax
      // 'examples/nextjs/**',
      'examples/an-azure-function-app/**',
      'lib/opentelemetry-bridge/opentelemetry-core-mini/**',
      'test/babel/out.js',
      'test/lambda/fixtures/esbuild-bundled-handler/hello.js',
      // NOTE: seems that eslint is parsing this files even when we ignore it and the parser
      // is not taking into account that they are in JSX syntax so it gives an error with the
      // message
      // ```
      // ./apm-agent-nodejs/test/instrumentation/modules/next/a-nextjs-app/pages/an-ssr-page.js
      // 22:5  error  Parsing error: Unexpected token <
      // ```
      // when added eslint recognizes the syntas and lints the file suggesting a lot of changes
      // to discus with @trentm
      //
      // 'test/instrumentation/modules/next/a-nextjs-app/pages/**',
      // 'test/instrumentation/modules/next/a-nextjs-app/components/**',
      'test/sourcemaps/fixtures/lib/**',
      'test/sourcemaps/fixtures/src/**',
      'test/stacktraces/fixtures/dist/**',
      'test/types/transpile/index.js',
      'test/types/transpile-default/index.js',
      'test_output/**',
      'tmp/**',
    ],
  },
];
