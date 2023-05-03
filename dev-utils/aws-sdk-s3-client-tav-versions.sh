#!/bin/sh
#
# Calculate and emit the "versions:" block of ".tav.yml" for aws-sdk.
# This will include:
# - the first supported release (2.858.0)
# - the latest current release
# - and ~5 releases in between

npm info -j @aws-sdk/client-s3 | node -e '
    var semver = require("semver");
    var chunks = [];
    process.stdin
        .resume()
        .on("data", (chunk) => { chunks.push(chunk) })
        .on("end", () => {
            var input = JSON.parse(chunks.join(""));
            var vers = input.versions.filter(v => semver.satisfies(v, ">=3 <4"));
            var modulus = Math.floor((vers.length - 2) / 5);
            console.log("  # Test v3.0.0, every N=%d of %d releases, and current latest.", modulus, vers.length);
            vers = vers.filter((v, idx, arr) => idx % modulus === 0 || idx === arr.length - 1);
            console.log("  versions: '\''%s || >%s <4'\''", vers.join(" || "), vers[vers.length-1])
        })
'
