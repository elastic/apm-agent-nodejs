#!/bin/bash

# the build folder -- will be created/destroyed in /tmp
BUILD_FOLDER="clean-build-node-lambda-arn"

# clear out build folder
rm -rf .tmp/${BUILD_FOLDER}
mkdir .tmp/${BUILD_FOLDER}
cd .tmp/${BUILD_FOLDER}

# npm install the extension
npm init -y
npm install --global-style https://github.com/elastic/apm-agent-nodejs#${BRANCH_NAME}
mkdir nodejs
mv node_modules nodejs
zip -r layer.zip nodejs
echo "layer file in /tmp/${BUILD_FOLDER}"
