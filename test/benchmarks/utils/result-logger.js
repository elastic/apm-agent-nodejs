'use strict'

// To be able to properly display the results in microseconds the stats are
// being re-calculated. The code to calculate the stats inside the `calc`
// function is lifted from the benchmarkjs library. So is the `tTable` data.
//
// The benchmarkjs library is under the MIT license:
// https://github.com/bestiejs/benchmark.js/blob/42f3b732bac3640eddb3ae5f50e445f3141016fd/LICENSE

const columnify = require('columnify')
const numeral = require('numeral')

module.exports = logResult

/**
 * T-Distribution two-tailed critical values for 95% confidence.
 * For more info see http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm.
 */
const tTable = {
  '1':  12.706, '2':  4.303, '3':  3.182, '4':  2.776, '5':  2.571, '6':  2.447,
  '7':  2.365,  '8':  2.306, '9':  2.262, '10': 2.228, '11': 2.201, '12': 2.179,
  '13': 2.16,   '14': 2.145, '15': 2.131, '16': 2.12,  '17': 2.11,  '18': 2.101,
  '19': 2.093,  '20': 2.086, '21': 2.08,  '22': 2.074, '23': 2.069, '24': 2.064,
  '25': 2.06,   '26': 2.056, '27': 2.052, '28': 2.048, '29': 2.045, '30': 2.042,
  'infinity': 1.96
}

function logResult (bench, control) {
  const a = calc(bench.stats.sample, 1e6)
  const b = calc(control.stats.sample, 1e6)

  const data = [
    { name: 'ops/sec', bench: format(bench.hz, 0), control: format(control.hz, 0) },
    { name: 'sample size', bench: bench.stats.sample.length, control: control.stats.sample.length },
    { name: 'sample arithmetic mean', bench: format(a.mean), bu: 'μs', control: format(b.mean), cu: 'μs' },
    { name: 'sample variance', bench: format(a.variance), control: format(b.variance) },
    { name: 'sample standard deviation', bench: format(a.deviation), bu: 'μs', control: format(b.deviation), cu: 'μs' },
    { name: 'standard error of the mean', bench: format(a.sem), bu: 'μs', control: format(b.sem), cu: 'μs' },
    { name: 'margin of error', bench: `±${format(a.moe)}`, bu: 'μs', control: `±${format(b.moe)}`, cu: 'μs' },
    { name: 'relative margin of error', bench: `±${format(a.rme)}`, bu: '%', control: `±${format(b.rme)}`, cu: '%' },
    { name: 'overhead', bench: format(bench.overhead * 1e6), bu: 'μs' }
  ]

  const options = {
    columns: ['name', 'bench', 'bu', 'control', 'cu'],
    config: {
      name: { showHeaders: false },
      bench: { align: 'right' },
      bu: { showHeaders: false },
      control: { align: 'right' },
      cu: { showHeaders: false }
    }
  }

  console.error(`${bench.name}:`)
  console.error(columnify(data, options))
  console.error()
}

function calc (sample, scale = 1) {
  sample = sample.map(sample => sample * scale)

  const size = sample.length
  // Compute the sample mean (estimate of the population mean).
  const mean = (sample.reduce((sum, x) => sum + x) / sample.length) || 0
  // Compute the sample variance (estimate of the population variance).
  const variance = sample.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (size - 1) || 0
  // Compute the sample standard deviation (estimate of the population standard deviation).
  const sd = Math.sqrt(variance)
  // Compute the standard error of the mean (a.k.a. the standard deviation of the sampling distribution of the sample mean).
  const sem = sd / Math.sqrt(size)
  // Compute the degrees of freedom.
  const df = size - 1
  // Compute the critical value.
  const critical = tTable[Math.round(df) || 1] || tTable.infinity
  // Compute the margin of error.
  const moe = sem * critical
  // Compute the relative margin of error.
  const rme = (moe / mean) * 100 || 0

  return {
    deviation: sd,
    mean,
    moe,
    rme,
    sem,
    variance,
  }
}

function format (n, decimals = 3) {
  if (decimals === 0) {
    return numeral(n).format('0,0')
  }
  return numeral(n).format(`0,0.${Array(decimals + 1).join(0)}`)
}
