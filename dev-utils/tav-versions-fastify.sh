#!/bin/sh
#
# Calculate and emit the "versions:" blocks of ".tav.yml" for "fastify".
#
# This will include:
# - the first supported release (2.858.0)
# - the latest current release
# - and ~5 releases in between

# For the `fastify-v3:` block.
npm info -j fastify | node -e '
    var semver = require("semver");
    var chunks = [];
    process.stdin
        .resume()
        .on("data", (chunk) => { chunks.push(chunk) })
        .on("end", () => {
            var fullRange = ">=3 <4";
            var input = JSON.parse(chunks.join(""));
            var vers = input.versions.filter(v => semver.satisfies(v, fullRange));
            var modulus = Math.floor((vers.length - 2) / 5);
            vers = vers.filter((v, idx, arr) => idx % modulus === 0 || idx === arr.length - 1);
            console.log("  versions: '\''%s || >%s <4'\'' # subset of '\''%s'\''", vers.join(" || "), vers[vers.length-1], fullRange)
        })
'

# For the `fastify:` block.
npm info -j fastify | node -e '
    var semver = require("semver");
    var chunks = [];
    process.stdin
        .resume()
        .on("data", (chunk) => { chunks.push(chunk) })
        .on("end", () => {
            var fullRange = ">=4 <4.0.1 || >4.0.1 <4.16.0 || >4.16.2";
            var input = JSON.parse(chunks.join(""));
            var vers = input.versions.filter(v => semver.satisfies(v, fullRange));
            var modulus = Math.floor((vers.length - 2) / 5);
            vers = vers.filter((v, idx, arr) => idx % modulus === 0 || idx === arr.length - 1);
            console.log("  versions: '\''%s || >%s'\'' # subset of '\''%s'\''", vers.join(" || "), vers[vers.length-1], fullRange)
        })
'
