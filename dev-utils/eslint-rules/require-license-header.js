/*
 * BSD 2-Clause License
 *
 * Copyright (c) 2012, Matt Robenolt
 * Copyright (c) 2013-2014, Thomas Watson Steen and Elasticsearch BV
 * Copyright (c) 2015-2020, Elasticsearch BV
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

const { join } = require('path')
const { readFileSync } = require('fs')

const LICENSE_CONTENTS = readFileSync(join(__dirname, '../../LICENSE'), 'utf-8')
const LICENSE =
  '/*\n' +
  LICENSE_CONTENTS.split('\n')
    .map(line => ` * ${line}`)
    .join('\n') +
  '\n */'

function normalizeWhitespace (string) {
  return string.replace(/\s+/g, ' ').trim()
}

function getComparableLicenseAST () {
  const lines = LICENSE.split('\n')
  return lines.slice(1, lines.length - 1).join('')
}

module.exports = context => {
  return {
    Program () {
      const license = {
        source: LICENSE,
        value: normalizeWhitespace(getComparableLicenseAST())
      }

      const sourceCode = context.getSourceCode()
      const comment = sourceCode
        .getAllComments()
        .find(node => normalizeWhitespace(node.value) === license.value)

      // no licence comment
      if (!comment) {
        context.report({
          message: 'File must start with a license header',
          loc: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: sourceCode.lines[0].length - 1 }
          },
          fix (fixer) {
            return fixer.replaceTextRange([0, 0], license.source + '\n\n')
          }
        })
        return
      }

      // ensure there is nothing before the comment
      const sourceBeforeNode = sourceCode
        .getText()
        .slice(0, sourceCode.getIndexFromLoc(comment.loc.start))
      if (sourceBeforeNode.length) {
        context.report({
          node: comment,
          message: 'License header must be at the very beginning of the file',
          fix (fixer) {
            // replace leading whitespace if possible
            if (sourceBeforeNode.trim() === '') {
              return fixer.replaceTextRange([0, sourceBeforeNode.length], '')
            }

            // inject content at top and remove node from current location
            // if removing whitespace is not possible
            return [
              fixer.remove(comment),
              fixer.replaceTextRange([0, 0], license.source + '\n\n')
            ]
          }
        })
      }
    }
  }
}
