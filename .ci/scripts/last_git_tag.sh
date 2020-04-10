#/usr/bin/env bash
git tag | tail -1 | sed "s/v//"
