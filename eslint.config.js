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
    // This block should *only* have the "ignores" property.
    // https://eslint.org/docs/latest/use/configure/configuration-files#globally-ignoring-files-with-ignores
    ignores: [
      '*.example.js', // a pattern for uncommited local dev files to avoid linting
      '*.example.mjs', // a pattern for uncommited local dev files to avoid linting

      'tmp/**',
      '.nyc_output/**',
      'build/**',
      'node_modules/**',
      '**/elastic-apm-node.js',
      '**/.next/**',

      'examples/esbuild/dist/**',
      'examples/typescript/dist/**',
      'examples/an-azure-function-app/**',
      'lib/opentelemetry-bridge/opentelemetry-core-mini/**',
      'test/babel/out.js',
      'test/lambda/fixtures/esbuild-bundled-handler/hello.js',
      'test/sourcemaps/fixtures/lib/**',
      'test/sourcemaps/fixtures/src/**',
      'test/stacktraces/fixtures/dist/**',
      'test/types/transpile/index.js',
      'test/types/transpile-default/index.js',
    ],
  },
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
          jsx: true, // to parse nextjs files
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
  },
];
