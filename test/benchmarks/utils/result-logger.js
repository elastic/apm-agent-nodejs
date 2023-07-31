/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Log a text table of the benchmark results.

const columnify = require('columnify');
const numeral = require('numeral');

module.exports = logResult;

function logResult(bench, control) {
  const SCALE = 1e6; // 1e6 is to scale from seconds to microseconds.

  const data = [
    {
      name: 'ops/sec',
      bench: format(bench.hz, 0),
      control: format(control.hz, 0),
    },
    {
      name: 'sample size',
      bench: bench.stats.sample.length,
      control: control.stats.sample.length,
    },
    {
      name: 'sample arithmetic mean',
      bench: format(bench.stats.mean * SCALE),
      bu: 'μs',
      control: format(control.stats.mean * SCALE),
      cu: 'μs',
    },
    {
      name: 'sample variance',
      // Variance is a geometric calculation, so square the scale.
      bench: format(bench.stats.variance * SCALE ** 2),
      control: format(control.stats.variance * SCALE ** 2),
    },
    {
      name: 'sample standard deviation',
      bench: format(bench.stats.deviation * SCALE),
      bu: 'μs',
      control: format(control.stats.deviation * SCALE),
      cu: 'μs',
    },
    {
      name: 'standard error of the mean',
      bench: format(bench.stats.sem * SCALE),
      bu: 'μs',
      control: format(control.stats.sem * SCALE),
      cu: 'μs',
    },
    {
      name: 'margin of error',
      bench: `±${format(bench.stats.moe * SCALE)}`,
      bu: 'μs',
      control: `±${format(control.stats.moe * SCALE)}`,
      cu: 'μs',
    },
    {
      name: 'relative margin of error',
      // This is a relative measure, so no scaling is required.
      bench: `±${format(bench.stats.rme)}`,
      bu: '%',
      control: `±${format(control.stats.rme)}`,
      cu: '%',
    },
    { name: 'overhead', bench: format(bench.overhead * SCALE), bu: 'μs' },
  ];

  const options = {
    columns: ['name', 'bench', 'bu', 'control', 'cu'],
    config: {
      name: { showHeaders: false },
      bench: { align: 'right' },
      bu: { showHeaders: false },
      control: { align: 'right' },
      cu: { showHeaders: false },
    },
  };

  console.error(`${bench.name}:`);
  console.error(columnify(data, options));
  console.error();
}

function format(n, decimals = 3) {
  if (decimals === 0) {
    return numeral(n).format('0,0');
  }
  return numeral(n).format(`0,0.${Array(decimals + 1).join(0)}`);
}
