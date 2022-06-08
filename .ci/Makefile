SHELL = /bin/bash -eo pipefail

AWS_FOLDER = ../build/aws
DIST_DIR = /build/dist/nodejs
LAMBDA_LAYER_ZIP_FILE = ../build/dist/elastic-apm-node-lambda-layer.zip
DOCKER_IMAGE_NAME = observability/apm-agent-nodejs
DOCKER_REGISTRY = docker.elastic.co
AGENT_VERSION = $(shell echo $${BRANCH_NAME} | cut -f 2 -d 'v')

export AWS_FOLDER

.PHONY: dist
dist: validate-branch-name
	../dev-utils/make-distribution.sh
	@mkdir -p $(AWS_FOLDER)
	cp $(LAMBDA_LAYER_ZIP_FILE) $(AWS_FOLDER)/elastic-apm-node-lambda-layer-$(BRANCH_NAME).zip

.PHONY: clean
clean:
	rm -rf $(AWS_FOLDER)

env:
	env

# Create Docker image
build-docker: validate-version
	docker build -t $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_NAME):$(AGENT_VERSION) \
  --build-arg AGENT_DIR=$(DIST_DIR) ..

push-docker: build-docker
	../dev-utils/push-docker.sh $(DOCKER_REGISTRY) $(DOCKER_IMAGE_NAME) $(AGENT_VERSION)

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
		--layer-name "$(ELASTIC_LAYER_NAME)" \
		--description "AWS Lambda Extension Layer for the Elastic APM Node.js Agent" \
		--license "Apache-2.0" \
		--compatible-runtimes nodejs16.x nodejs14.x nodejs12.x nodejs10.x \
		--zip-file "fileb://./$(AWS_FOLDER)/elastic-apm-node-lambda-layer-$(BRANCH_NAME).zip"

# Grant public access to the given LAYER in the given AWS region
grant-public-layer-access: validate-layer-name validate-aws-default-region
	@echo "[debug] $(ELASTIC_LAYER_NAME) with version: $$($(MAKE) -s --no-print-directory get-version)"
	@aws lambda \
		--output json \
		add-layer-version-permission \
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
create-arn-file: validate-suffix-arn-file validate-release-notes-url
	@./scripts/create-arn-table.sh

github-release: validate-branch-name validate-suffix-arn-file
	@gh release list
	@gh \
		release \
		create $(BRANCH_NAME) \
		--title '$(BRANCH_NAME)' \
		--notes-file $(AWS_FOLDER)/$(SUFFIX_ARN_FILE)

validate-version:
ifndef AGENT_VERSION
	$(error AGENT_VERSION is undefined)
endif

validate-branch-name:
ifndef BRANCH_NAME
	$(error BRANCH_NAME is undefined)
endif

validate-suffix-arn-file:
ifndef SUFFIX_ARN_FILE
	$(error SUFFIX_ARN_FILE is undefined)
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
