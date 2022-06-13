#!/bin/bash
#
# Generate a NOTICE file for a distribution of this agent. It includes the
# "./NOTICE.md" file (which includes the licenses of all vendored code), plus
# the licenses for all included runtime dependencies.  This will also error out
# if the license for a dep cannot be determined, or if the license isn't one of
# the known ones.
#
# Usage:
#   ./dev-utils/gen-notice.sh DIST_DIR
#
# where DIST_DIR is the distribution directory (the dir that holds the
# "package.json" and "node_modules/" dir).
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

# ---- support functions

function fatal {
    echo "$(basename $0): error: $*"
    exit 1
}

# ---- mainline

TOP=$(cd $(dirname $0)/../ >/dev/null; pwd)
DIST_DIR="$1"
[[ -n "$DIST_DIR" ]] || fatal "missing DIST_DIR argument"
[[ -f "$DIST_DIR/package.json" ]] || fatal "invalid DIST_DIR: $DIST_DIR/package.json does not exist"

# Directory holding some "license.*.txt" files for inclusion below.
export LIC_DIR=$(cd $(dirname $0)/ >/dev/null; pwd)

cat $TOP/NOTICE.md

# Emit a Markdown section listing the license for each non-dev dependency
# in the DIST_DIR. This errors out if a license cannot be found or isn't known.
cd $DIST_DIR
npm ls --omit=dev --all --parseable \
    | node -e '
        const fs = require("fs")
        const path = require("path")
        const knownLicTypes = {
            "Apache-2.0": true,
            "BSD-2-Clause": true,
            "BSD-3-Clause": true,
            "CC0-1.0": true,
            "ISC": true,
            "MIT": true,
            "WTFPL OR ISC": true // oddball from is-integer package
        }
        const licFileNames = [
            "LICENSE",
            "LICENSE.txt",
            "license.md",
            "LICENSE-MIT",
            "LICENSE-MIT.txt"
        ]
        // We handle getting the license text for a few specific deps that
        // do not include one in their install.
        const licFileFromPkgName = {
            "async-value": "license.MIT.txt",
            "async-value-promise": "license.MIT.txt",
            "breadth-filter": "license.MIT.txt",
            "mapcap": "license.MIT.txt",
            "measured-core": "license.node-measured.txt",
            "measured-reporting": "license.node-measured.txt",
            "object-identity-map": "license.MIT.txt",
            "set-cookie-serde": "license.MIT.txt",
        }
        const allowNoLicFile = [
            "binary-search" // CC is a public domain dedication, no need for license text.
        ]
        const chunks = []
        process.stdin.on("data", chunk => chunks.push(chunk))
        process.stdin.on("end", () => {
            console.log("\n\n# Notice for distributed packages")
            const depDirs = chunks.join('').trim().split(/\n/g)
            depDirs.shift() // Drop first dir, it is elastic-apm-node.
            depDirs.forEach(depDir => {
                const pj = require(`${depDir}/package.json`)
                let licType = pj.license
                if (!licType && pj.licenses) {
                    licType = pj.licenses
                        .map(licObj => licObj.type)
                        .filter(licType => knownLicTypes[licType])[0]
                }
                if (!licType) {
                    throw new Error(`cannot determine license for ${pj.name}@${pj.version} in ${depDir}`)
                } else if (!knownLicTypes[licType]) {
                    throw new Error(`license for ${pj.name}@${pj.version} in ${depDir} is not known: ${licType}`)
                }
                console.log(`\n## ${pj.name}@${pj.version} (${licType})`)

                let licPath
                for (let i = 0; i < licFileNames.length; i++) {
                    const p = `${depDir}/${licFileNames[i]}`
                    if (fs.existsSync(p)) {
                        licPath = p
                        break
                    }
                }
                if (!licPath && licFileFromPkgName[pj.name]) {
                    licPath = path.join(process.env.LIC_DIR, licFileFromPkgName[pj.name])
                }
                if (!licPath && !allowNoLicFile.includes(path.basename(depDir))) {
                    throw new Error(`cannot find license file for ${pj.name}@${pj.version} in ${depDir}`)
                }
                if (licPath) {
                    console.log("\n```\n" + fs.readFileSync(licPath, "utf8").trimRight() + "\n```")
                }
            })
        })
    '
