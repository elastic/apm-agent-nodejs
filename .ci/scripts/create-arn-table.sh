#!/usr/bin/env bash
set -o pipefail

#
# Create the AWS ARN table given the below environment variables:
#
# - AWS_FOLDER        - that's the location of the publish-layer-version output for each region.
# - RELEASE_NOTES_URL - that's the URL for the changelog in the elastic.co
#

ARN_FILE=arn-file.md

{
	echo "For more information, please see the [changelog](${RELEASE_NOTES_URL})."
	echo ''
	echo "### Elastic APM Node.js agent layer ARNs"
	echo ''
	echo '|Region|ARN|'
	echo '|------|---|'
} > "${AWS_FOLDER}/${ARN_FILE}"


for f in "${AWS_FOLDER}"/*.publish; do
	LAYER_VERSION_ARN=$(grep '"LayerVersionArn"' "${f}" | cut -d":" -f2- | sed 's/ //g' | sed 's/"//g' | cut -d"," -f1)
	FILENAME=$(basename /"${f}" .publish)
	echo "INFO: create-arn-table ARN(${LAYER_VERSION_ARN}):region(${FILENAME}))"
	echo "|${FILENAME}|${LAYER_VERSION_ARN}|" >> "${AWS_FOLDER}/${ARN_FILE}"
done

echo '' >> "${AWS_FOLDER}/${ARN_FILE}"
