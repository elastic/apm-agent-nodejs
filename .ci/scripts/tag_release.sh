#!/usr/bin/env bash

set -xuo pipefail

POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -v|--version)
    VERSION="$2"
    shift
    shift
    ;;
    -h|--help)
    echo "Use: tag_release.sh --version 0.8.9"
    exit 0
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done

LAST_MAJOR_BRANCH=$(`dirname $0`/last_major_branch.sh)

# Commit changes with message x.y.z where x.y.z is the version in package.json
git commit -a -m \"${VERSION}\"

# Tag the commit with git tag vx.y.x, for example git tag v1.2.3
git tag v${VERSION}

# Branch to last major
git branch -f ${LAST_MAJOR_BRANCH}

# Push commits and tags upstream with git push upstream master && git push upstream --tags 
git push upstream master
git push upstream --tags

# Update the latest major branch on upstream with git push upstream <major_branch>
git push upstream ${LAST_MAJOR_BRANCH}
