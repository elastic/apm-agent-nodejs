#!/usr/bin/env bash

# This script gets the latest branch
git branch -r | egrep 'origin/[0-9]\.x' | cut -d'/' -f2 | sort -n | tail -1
