const escapeStringRegexp = require('escape-string-regexp')

// simple implementation to support (?-i) and (?+i) prefixes.
// this function will remove these prefixes from the pattern,
// and also add or remove i on an array of opts as needed.
const parsePatternAndOptsFromPattern = (pattern, opts = []) => {
  const indexCaseSensative = pattern.indexOf('(?-i)')
  const indexCaseInsensative = pattern.indexOf('(?+i)')
  // bail out if there's no prefixes
  if (indexCaseSensative !== 0 && indexCaseInsensative !== 0) {
    return { finalPattern: pattern, finalOpts: opts }
  }

  // remove i from opts if it's there
  if (opts.indexOf('i') !== -1) {
    opts.splice(opts.indexOf('i'), 1)
  }

  // add i back if need be and remove case insensative prefix
  if (indexCaseInsensative === 0) {
    opts.push('i')
  }

  // remove prefix
  const parts = pattern.split(')')
  parts.shift()
  return { finalPattern: parts.join(''), finalOpts: opts }
}

// coverts elastic-wildcard pattern into a
// a javascript regular expression.
const starMatchToRegex = (pattern, opts) => {
  const { finalPattern, finalOpts } = parsePatternAndOptsFromPattern(pattern, opts)
  const patternLength = finalPattern.length
  const reChars = ['^']
  for (let i = 0; i < patternLength; i++) {
    const char = finalPattern[i]
    switch (char) {
      case '*':
        reChars.push('.*')
        break
      default:
        reChars.push(
          escapeStringRegexp(char)
        )
    }
  }
  reChars.push('$')
  return new RegExp(reChars.join(''), finalOpts.join(''))
}

class WildcardMatcher {
  compile (pattern, opts = ['i']) {
    return starMatchToRegex(pattern, opts)
  }

  match (string, pattern, opts = ['i']) {
    const re = this.compile(pattern, opts)
    return string.search(re) !== -1
  }
}
module.exports = { WildcardMatcher }
