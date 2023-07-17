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
#   ./dev-utils/gen-notice.sh --lint DIST_DIR   # lint mode
#
# where DIST_DIR is the distribution directory (the dir that holds the
# "package.json" and "node_modules/" dir).
#
# When the '--lint' option is given, this will run in "lint mode":
# - the NOTICE content is not emitted to stdout
# - if the version of 'npm' is too old it will *warn*, and exit successfully
#   (this is to support using this for linting in CI in the same was as
#   eslint, which requires a newer node))
#

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

# ---- support functions

function warn {
    echo "$(basename $0): warn: $*" >&2
}

function fatal {
    echo "$(basename $0): error: $*" >&2
    exit 1
}

# ---- mainline

TOP=$(cd $(dirname $0)/../ >/dev/null; pwd)
if [[ "$1" == "--lint" ]]; then
    LINT_MODE=true
    OUTFILE=/dev/null
    shift
else
    LINT_MODE=false
    OUTFILE=/dev/stdout
fi
DIST_DIR="$1"
[[ -n "$DIST_DIR" ]] || fatal "missing DIST_DIR argument"
[[ -f "$DIST_DIR/package.json" ]] || fatal "invalid DIST_DIR: $DIST_DIR/package.json does not exist"

# Guard against accidentally using this script with a too-old npm (<v8.7.0).
npmVer=$(npm --version)
npmMajorVer=$(echo "$npmVer" | cut -d. -f1)
npmMinorVer=$(echo "$npmVer" | cut -d. -f2)
if [[ $npmMajorVer -lt 8 || ($npmMajorVer -eq 8 && $npmMinorVer -lt 7) ]]; then
    if [[ "$LINT_MODE" == "true" ]]; then
        warn "npm version is too old for 'npm ci --omit=dev': $npmVer"
        exit 0
    fi
    fatal "npm version is too old for 'npm ci --omit=dev': $npmVer"
fi

# Directory holding some "license.*.txt" files for inclusion below.
export MANUAL_LIC_DIR=$(cd $(dirname $0)/ >/dev/null; pwd)

cat $TOP/NOTICE.md >$OUTFILE

# Emit a Markdown section listing the license for each non-dev dependency
# in the DIST_DIR. This errors out if a license cannot be found or isn't known.
cd $DIST_DIR
npm ls --omit=dev --all --parseable \
    | node -e '
        const fs = require("fs")
        const path = require("path")
        const knownLicTypes = {
            "0BSD": true,
            "Apache-2.0": true,
            "BSD-2-Clause": true,
            "BSD-3-Clause": true,
            "CC0-1.0": true,
            "ISC": true,
            "MIT": true,
            "WTFPL OR ISC": true // oddball from is-integer package
        }
        // We handle getting the license text for a few specific deps that
        // do not include one in their install.
        const licFileFromPkgName = {
            "acorn-import-assertions": "license.MIT.txt",
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
                // npm-packlist always includes any file matching "licen[cs]e.*"
                // (case-insensitive) as a license file. However some of our
                // deps use "LICENSE-MIT.*", which we need to allow as well.
                const dir = fs.opendirSync(depDir)
                let dirent
                while (dirent = dir.readSync()) {
                    if (dirent.isFile() && /^licen[cs]e(-\w+)?(\..*)?$/i.test(dirent.name)) {
                        licPath = path.join(depDir, dirent.name)
                        break
                    }
                }
                dir.close()
                if (!licPath && licFileFromPkgName[pj.name]) {
                    licPath = path.join(process.env.MANUAL_LIC_DIR, licFileFromPkgName[pj.name])
                }
                if (!licPath && !allowNoLicFile.includes(path.basename(depDir))) {
                    throw new Error(`cannot find license file for ${pj.name}@${pj.version} in ${depDir}`)
                }
                if (licPath) {
                    console.log("\n```\n" + fs.readFileSync(licPath, "utf8").trimRight() + "\n```")
                }
            })
        })
    ' >$OUTFILE
