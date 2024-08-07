SHELL = /bin/bash -eo pipefail
MAKEFLAGS += --no-print-directory
AWS_FOLDER = ../build/aws
LAMBDA_LAYER_ZIP_FILE = ../build/dist/elastic-apm-node-lambda-layer.zip
SUFFIX_ARN_FILE = arn-file.md
AGENT_VERSION = $(subst v,,$(GITHUB_REF_NAME))
MAJOR_VERSION = $(shell cut -d '.' -f 1 <<< $(AGENT_VERSION))
ELASTIC_LAYER_VERSION = $(subst .,-,$(AGENT_VERSION))
RELEASE_NOTES_URL = https://www.elastic.co/guide/en/apm/agent/nodejs/current/release-notes-$(MAJOR_VERSION).x.html\#release-notes-$(AGENT_VERSION)
ELASTIC_LAYER_NAME = elastic-apm-node-ver-$(ELASTIC_LAYER_VERSION)
export AWS_FOLDER

.PHONY: dist
dist: validate-ref-name
	../dev-utils/make-distribution.sh
	@mkdir -p $(AWS_FOLDER)
	cp $(LAMBDA_LAYER_ZIP_FILE) $(AWS_FOLDER)/elastic-apm-node-lambda-layer-$(GITHUB_REF_NAME).zip

# Debug env variables created on the fly
debug-env:
	@echo "GITHUB_REF_NAME=$${GITHUB_REF_NAME}"
	@echo "AGENT_VERSION=$(AGENT_VERSION)"
	@echo "MAJOR_VERSION=$(MAJOR_VERSION)"
	@echo "ELASTIC_LAYER_VERSION=$(ELASTIC_LAYER_VERSION)"
	@echo "RELEASE_NOTES_URL=$(RELEASE_NOTES_URL)"
	@echo "ELASTIC_LAYER_NAME=$(ELASTIC_LAYER_NAME)"

.PHONY: clean
clean:
	@rm -rf $(AWS_FOLDER)

env:
	@env | sort

# List all the AWS regions
get-all-aws-regions:
	@mkdir -p $(AWS_FOLDER)
	@aws \
		ec2 \
		describe-regions \
		--region us-east-1 \
		--output json \
		--no-cli-pager \
		| jq -r '.Regions[].RegionName' > $(AWS_FOLDER)/.regions

# Publish the given LAYER in all the AWS regions
publish-in-all-aws-regions: validate-layer-name get-all-aws-regions
	@mkdir -p $(AWS_FOLDER)
	@while read AWS_DEFAULT_REGION; do \
		echo "publish '$(ELASTIC_LAYER_NAME)' in $${AWS_DEFAULT_REGION}"; \
		AWS_DEFAULT_REGION="$${AWS_DEFAULT_REGION}" ELASTIC_LAYER_NAME=$(ELASTIC_LAYER_NAME) $(MAKE) publish > $(AWS_FOLDER)/$${AWS_DEFAULT_REGION}.publish; \
		AWS_DEFAULT_REGION="$${AWS_DEFAULT_REGION}" ELASTIC_LAYER_NAME=$(ELASTIC_LAYER_NAME) $(MAKE) grant-public-layer-access; \
	done < $(AWS_FOLDER)/.regions

# Publish the given LAYER in the given AWS region
publish: validate-layer-name validate-aws-default-region
	@aws lambda \
		--output json \
		publish-layer-version \
		--region="$(AWS_DEFAULT_REGION)" \
		--layer-name "$(ELASTIC_LAYER_NAME)" \
		--description "AWS Lambda Extension Layer for the Elastic APM Node.js Agent" \
		--license "Apache-2.0" \
		--compatible-runtimes nodejs20.x nodejs18.x nodejs16.x nodejs14.x \
		--zip-file "fileb://./$(AWS_FOLDER)/elastic-apm-node-lambda-layer-$(GITHUB_REF_NAME).zip"

# Grant public access to the given LAYER in the given AWS region
grant-public-layer-access: validate-layer-name validate-aws-default-region
	@echo "[debug] $(ELASTIC_LAYER_NAME) with version: $$($(MAKE) -s --no-print-directory get-version)"
	@aws lambda \
		--output json \
		add-layer-version-permission \
		--region="$(AWS_DEFAULT_REGION)" \
		--layer-name "$(ELASTIC_LAYER_NAME)" \
		--action lambda:GetLayerVersion \
		--principal '*' \
		--statement-id "$(ELASTIC_LAYER_NAME)" \
		--version-number $$($(MAKE) -s --no-print-directory get-version) > $(AWS_FOLDER)/$(AWS_DEFAULT_REGION).public

# Get the ARN Version for the AWS_REGIONS
# NOTE: jq -r .Version "$(AWS_FOLDER)/$(AWS_DEFAULT_REGION)" fails in the CI
#       with 'parse error: Invalid numeric literal at line 1, column 5'
get-version: validate-aws-default-region
	@grep '"Version"' "$(AWS_FOLDER)/$(AWS_DEFAULT_REGION).publish" | cut -d":" -f2 | sed 's/ //g' | cut -d"," -f1

# Generate the file with the ARN entries
create-arn-file: validate-release-notes-url
	@RELEASE_NOTES_URL=$(RELEASE_NOTES_URL) ./scripts/create-arn-table.sh

github-release: validate-ref-name
	../dev-utils/github-release.sh "$(GITHUB_REF_NAME)" "$(AWS_FOLDER)/$(SUFFIX_ARN_FILE)"

validate-ref-name:
ifndef GITHUB_REF_NAME
	$(error GITHUB_REF_NAME is undefined)
endif

validate-layer-name:
ifndef ELASTIC_LAYER_NAME
	$(error ELASTIC_LAYER_NAME is undefined)
endif

validate-aws-default-region:
ifndef AWS_DEFAULT_REGION
	$(error AWS_DEFAULT_REGION is undefined)
endif

validate-release-notes-url:
ifndef RELEASE_NOTES_URL
	$(error RELEASE_NOTES_URL is undefined)
endif
