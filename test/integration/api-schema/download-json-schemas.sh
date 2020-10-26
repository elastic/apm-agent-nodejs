
#!/usr/bin/env bash

set -ex
if ! [ -n "$1" ]; then
    echo "USAGE: ./download-json-schemas.sh /path/to/folder"
    echo ""
    echo "Downloads the APM Server Schema files to the specified folder"
    exit 1
fi

download_schema()
{
    rm -rf ${1} && mkdir -p ${1}
    for run in 1 2 3 4 5
    do
        if [ -x "$(command -v gtar)" ]; then
            curl --silent --fail https://codeload.github.com/elastic/apm-server/tar.gz/${2} | gtar xzvf - --wildcards --directory=${1} --strip-components=1 "*/docs/spec/*"
        else
            curl --silent --fail https://codeload.github.com/elastic/apm-server/tar.gz/${2} | tar xzvf - --wildcards --directory=${1} --strip-components=1 "*/docs/spec/*"
        fi
        result=$?
        if [ $result -eq 0 ]; then break; fi
        sleep 1
    done

    if [ $result -ne 0 ]; then exit $result; fi

    mv -f ${1}/docs/spec/* ${1}/
    rm -rf ${1}/docs
}

download_schema $1 master

echo "Done."
