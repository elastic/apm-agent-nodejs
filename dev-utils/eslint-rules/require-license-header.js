/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

function normalizeWhitespace (string) {
  return string.replace(/\s+/g, ' ').trim()
}

// License to be appended to every source file
const LICENSE = `/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */`

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
        .find(node => {
          return normalizeWhitespace(node.value) === license.value
        })

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
