#!/usr/bin/env bash
set -o pipefail

#
# Create the AWS ARN table given the below environment variables:
#
# - AWS_FOLDER      - that's the location of the publish-layer-version output for each region.
#	- SUFFIX_ARN_FILE - that's the output file to be stored in the AWS_FOLDER.
#

ARN_FILE=${SUFFIX_ARN_FILE}

{
	echo "### ARN"
	echo ''
	echo '|Region|ARN|'
	echo '|------|---|'
} > "${AWS_FOLDER}/${ARN_FILE}"


for f in "${AWS_FOLDER}"/*.publish; do
	LAYER_VERSION_ARN=$(grep '"LayerVersionArn"' "$AWS_FOLDER/${f}" | cut -d":" -f2- | sed 's/ //g' | sed 's/"//g' | cut -d"," -f1)
	FILENAME=$(basename /"${f}" .publish)
	echo "INFO: create-arn-table ARN(${LAYER_VERSION_ARN}):region(${FILENAME}))"
	echo "|${FILENAME}|${LAYER_VERSION_ARN}|" >> "${AWS_FOLDER}/${ARN_FILE}"
done

echo '' >> "${AWS_FOLDER}/${ARN_FILE}"
