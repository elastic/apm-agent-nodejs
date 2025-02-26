---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/lambda.html
---

# Monitoring AWS Lambda Node.js Functions [lambda]

The Node.js APM Agent can be used with AWS Lambda to monitor the execution of your AWS Lambda functions.


## Quick Start [aws-lambda-nodejs-quick-start]

To get started with APM for your Node.js AWS Lambda functions follow the steps below.


### Prerequisites [aws-lambda-nodejs-prerequisites]

You need an APM Server to send APM data to. Follow the [APM Quick start](docs-content://solutions/observability/apps/get-started-with-apm.md) if you have not set one up yet. For the best-possible performance, we recommend setting up APM on {{ecloud}} in the same AWS region as your AWS Lambda functions.


### Step 1: Select the AWS Region and Architecture [_step_1_select_the_aws_region_and_architecture]

<style>
[role="lambda-selector"] {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  border: 1px solid hsl(219, 1%, 72%);
  border-radius: 0.2em 0.2em 0 0;
  overflow: visible;
  font-family: inherit;
  font-size: inherit;
  background: hsl(220, 43%, 99%);
  margin-top: 20px;
  margin-bottom: 20px;
}

[role="lambda-selector-content"] {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  margin-top: 10px;
  column-gap: 50px;
}

[role="lambda-selector-input"] {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  column-gap: 5px;
}

[role="select-input"] {
    border: none;
    margin-left: 1px;
    color: #2b4590;
    font-weight: bold;
    border-radius: 5px;
}

[role="lambda-selector-header"] {
  align-self: flex-start;
}

#fallback-extension-arn-selector-section {
  display: none;
}

#fallback-agent-arn-selector-section {
  display: none;
}
</style>

<script>
const lambdaAttributesUpdateListeners = [];
const layerArnPattern = /arn:aws:lambda:[^:]*:[^:]*:layer:[^:]*:\d*/g;

const updateLambdaAttributes = () => {
      const region = document.getElementById("lambda-aws-region").value;
      const arch = document.getElementById("lambda-arch").value;
      lambdaAttributesUpdateListeners.forEach(listener => listener(region, arch));
    };

const replaceAgentDockerImageParams = async (importStatement, copyStatement) => {
  const containerTab = document.getElementById("container-tab-layer");
  containerTab.innerHTML = containerTab.innerHTML.replace(/AGENT_IMPORT/, importStatement);
  containerTab.innerHTML = containerTab.innerHTML.replace(/AGENT_COPY/, copyStatement);
}

const updateExtensionDockerImageArch = (region, arch) => {
  document.querySelectorAll(`[role="replaceLambdaArch"]`).forEach(span => {
    span.innerHTML = arch;
  });
};

const addArnGenerator = async (type, ghRepo, arnPattern) => {
  const tabs = document.getElementsByName("lambda-tabpanel");
  const rgx = type === 'agent' ? /AGENT_ARN/ : /EXTENSION_ARN/;
  tabs.forEach(tab => {
    tab.innerHTML = tab.innerHTML.replace(rgx, `<span role="replace${type}Arn"></span>`)
                                  .replace(/IMAGE_ARCH/, `<span role="replaceLambdaArch"></span>`);
  });

  var version = undefined;
  var releaseArns = [];

  const retrieveLatestLayerVersion = async () => {
    var latestRelease = await fetch(`https://api.github.com/repos/elastic/${ghRepo}/releases/latest`).then(data => {
        return data.status >= 400 ? undefined : data.json();
      });

    if (latestRelease) {
      releaseArns = latestRelease.body.match(layerArnPattern);
      version = latestRelease.tag_name.replace("v","ver-").replace(/\./g, '-');
    } else {
      document.getElementById("default-arn-selector-section").style.display = "none";
      const fallbackSection = document.getElementById(`fallback-${type}-arn-selector-section`);
      if(fallbackSection){
        fallbackSection.innerHTML = fallbackSection.innerHTML.replace(/RELEASE_LINK/, `https://github.com/elastic/${ghRepo}/releases/latest`);
        fallbackSection.style.display = "block";
      }
    }
  };

  const updateARN = (region, arch) => {
      var arn = `<SELECTED_${type.toUpperCase()}_LAYER_ARN>`;
      if(version && releaseArns.length > 0){
        const arnWithoutLayerVersion = arnPattern.replace(/\$\{region\}/, region).replace(/\$\{arch\}/, arch).replace(/\$\{version\}/, version);
        const lookedUpArn = releaseArns.find(a => a.startsWith(arnWithoutLayerVersion));
        if(lookedUpArn){
          arn = lookedUpArn;
        }
      }
      document.querySelectorAll(`[role="replace${type}Arn"]`).forEach(span => {
        span.innerHTML = arn;
      });
    };

  lambdaAttributesUpdateListeners.push(updateARN);
  await retrieveLatestLayerVersion();
  updateLambdaAttributes();
}

window.addEventListener("DOMContentLoaded", async () => {
  const arnInputs = document.querySelectorAll('[role="select-input"]');

  arnInputs.forEach(input => {
    input.addEventListener("change", e => updateLambdaAttributes());
  });

  lambdaAttributesUpdateListeners.push(updateExtensionDockerImageArch);
  updateLambdaAttributes();
});
</script>

<p id="fallback-extension-arn-selector-section">Pick the right ARN from <a target="_blank" href="RELEASE_LINK">this release table for the APM Lambda Extension Layer</a>.</p>
<p id="fallback-agent-arn-selector-section">In addition, pick the right ARN from <a target="_blank" href="RELEASE_LINK">this release table for the APM Agent Layer</a>.</p>
<div id="default-arn-selector-section" role="lambda-selector">
  <div role="lambda-selector-header">Select the AWS region and architecture of your Lambda function. This documentation will update based on your selections.</div>
  <div role="lambda-selector-content">
    <div role="lambda-selector-input">
      <div>region:</div>
      <select id="lambda-aws-region" role="select-input">
        <option value="af-south-1">af-south-1</option>
        <option value="ap-east-1">ap-east-1</option>
        <option value="ap-northeast-1">ap-northeast-1</option>
        <option value="ap-northeast-2">ap-northeast-2</option>
        <option value="ap-northeast-3">ap-northeast-3</option>
        <option value="ap-south-1">ap-south-1</option>
        <option value="ap-southeast-1">ap-southeast-1</option>
        <option value="ap-southeast-2">ap-southeast-2</option>
        <option value="ap-southeast-3">ap-southeast-3</option>
        <option value="ca-central-1">ca-central-1</option>
        <option value="eu-central-1">eu-central-1</option>
        <option value="eu-north-1">eu-north-1</option>
        <option value="eu-south-1">eu-south-1</option>
        <option value="eu-west-1">eu-west-1</option>
        <option value="eu-west-2">eu-west-2</option>
        <option value="eu-west-3">eu-west-3</option>
        <option value="me-south-1">me-south-1</option>
        <option value="sa-east-1">sa-east-1</option>
        <option value="us-east-1" selected="selected">us-east-1</option>
        <option value="us-east-2">us-east-2</option>
        <option value="us-west-1">us-west-1</option>
        <option value="us-west-2">us-west-2</option>
      </select>
    </div>
    <div role="lambda-selector-input">
      <div>architecture:</div>
      <select id="lambda-arch" role="select-input">
        <option value="x86_64">x86_64</option>
        <option value="arm64">arm64</option>
      </select>
    </div>
  </div>
</div>
::::{warning}
The selected *AWS region* and the *architecture* must match the AWS region and architecture of your AWS Lambda function!
::::



### Step 2: Add the APM Layers to your Lambda function [_step_2_add_the_apm_layers_to_your_lambda_function]

<script>
window.addEventListener("DOMContentLoaded", async () => {
  addArnGenerator('extension', 'apm-aws-lambda', 'arn:aws:lambda:${region}:267093732750:layer:elastic-apm-extension-${version}-${arch}');
});
</script>
<script>
window.addEventListener("DOMContentLoaded", async () => {
  addArnGenerator('agent', 'apm-agent-nodejs', 'arn:aws:lambda:${region}:267093732750:layer:elastic-apm-node-${version}');
  replaceAgentDockerImageParams('FROM docker.elastic.co/observability/apm-agent-nodejs:latest AS nodejs-agent',
                                'COPY --from=nodejs-agent /opt/nodejs/ /opt/nodejs/');
});
</script>
Both the [{{apm-lambda-ext}}](apm-aws-lambda://docs/reference/index.md) and the Node.js APM Agent are added to your Lambda function as [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/invocation-layers.md). Therefore, you need to add the corresponding Layer ARNs (identifiers) to your Lambda function.

:::::::{tab-set}

::::::{tab-item} AWS Web Console
To add the layers to your Lambda function through the AWS Management Console:

1. Navigate to your function in the AWS Management Console
2. Scroll to the Layers section and click the *Add a layer* button ![image of layer configuration section in AWS Console](../images/config-layer.png "")
3. Choose the *Specify an ARN* radio button
4. Copy and paste the following ARNs of the {{apm-lambda-ext}} layer and the APM agent layer in the *Specify an ARN* text input:<br> APM Extension layer:<br> <span style="font-size:10pt"><b>EXTENSION_ARN</b></span><br> APM agent layer:<br> <span style="font-size:10pt"><b>AGENT_ARN</b></span> ![image of choosing a layer in AWS Console](../images/choose-a-layer.png "")
5. Click the *Add* button
::::::

::::::{tab-item} AWS CLI
To add the Layer ARNs of the {{apm-lambda-ext}} and the APM agent through the AWS command line interface execute the following command:

```bash
aws lambda update-function-configuration --function-name yourLambdaFunctionName \
--layers EXTENSION_ARN \
AGENT_ARN
```
::::::

::::::{tab-item} SAM
In your SAM `template.yml` file add the Layer ARNs of the {{apm-lambda-ext}} and the APM agent as follows:

```yaml
...
Resources:
  yourLambdaFunction:
    Type: AWS::Serverless::Function
    Properties:
      ...
      Layers:
          - EXTENSION_ARN
          - AGENT_ARN
...
```
::::::

::::::{tab-item} Serverless
In your `serverless.yml` file add the Layer ARNs of the {{apm-lambda-ext}} and the APM agent to your function as follows:

```yaml
...
functions:
  yourLambdaFunction:
    handler: ...
    layers:
      - EXTENSION_ARN
      - AGENT_ARN
...
```
::::::

::::::{tab-item} Terraform
To add the{{apm-lambda-ext}} and the APM agent to your function add the ARNs to the `layers` property in your Terraform file:

```yaml
...
resource "aws_lambda_function" "your_lambda_function" {
  ...
  layers = ["EXTENSION_ARN", "AGENT_ARN"]
}
...
```
::::::

::::::{tab-item} Container Image
To add the {{apm-lambda-ext}} and the APM agent to your container-based function extend the Dockerfile of your function image as follows:

```Dockerfile
FROM docker.elastic.co/observability/apm-lambda-extension-IMAGE_ARCH:latest AS lambda-extension
AGENT_IMPORT

# FROM ...  <-- this is the base image of your Lambda function

COPY --from=lambda-extension /opt/elastic-apm-extension /opt/extensions/elastic-apm-extension
AGENT_COPY

# ...
```
::::::

:::::::

### Step 3: Configure APM on AWS Lambda [_step_3_configure_apm_on_aws_lambda]

The {{apm-lambda-ext}} and the APM Node.js agent are configured through environment variables on the AWS Lambda function.

For the minimal configuration, you will need the *APM Server URL* to set the destination for APM data and an *{{apm-guide-ref}}/secret-token.html[APM Secret Token]*. If you prefer to use an [APM API key](docs-content://solutions/observability/apps/api-keys.md) instead of the APM secret token, use the `ELASTIC_APM_API_KEY` environment variable instead of `ELASTIC_APM_SECRET_TOKEN` in the following configuration.

For production environments, we recommend [using the AWS Secrets Manager to store your APM authentication key](apm-aws-lambda://docs/reference/aws-lambda-secrets-manager.md) instead of providing the secret value as plaintext in the environment variables.

:::::::{tab-set}

::::::{tab-item} AWS Web Console
To configure APM through the AWS Management Console:

1. Navigate to your function in the AWS Management Console
2. Click on the *Configuration* tab
3. Click on *Environment variables*
4. Add the following required variables:

```bash
NODE_OPTIONS                  = -r elastic-apm-node/start <1>
ELASTIC_APM_LAMBDA_APM_SERVER = <YOUR-APM-SERVER-URL>     <2>
ELASTIC_APM_SECRET_TOKEN      = <YOUR-APM-SECRET-TOKEN>   <3>
ELASTIC_APM_SEND_STRATEGY     = background                <4>
```

1. Use this exact fixed value.
2. This is your APM Server URL.
3. This is your APM secret token.
4. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

![Node.js environment variables configuration section in AWS Console](../images/nodejs-lambda-env-vars.png "")
::::::

::::::{tab-item} AWS CLI
To configure APM through the AWS command line interface execute the following command:

```bash
aws lambda update-function-configuration --function-name yourLambdaFunctionName \
    --environment "Variables={NODE_OPTIONS=-r elastic-apm-node/start,ELASTIC_APM_LAMBDA_APM_SERVER=<YOUR-APM-SERVER-URL>,ELASTIC_APM_SECRET_TOKEN=<YOUR-APM-SECRET-TOKEN>,ELASTIC_APM_SEND_STRATEGY=background}" <1>
```

1. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

::::::

::::::{tab-item} SAM
In your SAM `template.yml` file configure the following environment variables:

```yaml
...
Resources:
  yourLambdaFunction:
    Type: AWS::Serverless::Function
    Properties:
      ...
      Environment:
          Variables:
            NODE_OPTIONS: -r elastic-apm-node/start
            ELASTIC_APM_LAMBDA_APM_SERVER: <YOUR-APM-SERVER-URL>
            ELASTIC_APM_SECRET_TOKEN: <YOUR-APM-SECRET-TOKEN>
            ELASTIC_APM_SEND_STRATEGY: background <1>
...
```

1. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

::::::

::::::{tab-item} Serverless
In your `serverless.yml` file configure the following environment variables:

```yaml
...
functions:
  yourLambdaFunction:
    ...
    environment:
      NODE_OPTIONS: -r elastic-apm-node/start
      ELASTIC_APM_LAMBDA_APM_SERVER: <YOUR-APM-SERVER-URL>
      ELASTIC_APM_SECRET_TOKEN: <YOUR-APM-SECRET-TOKEN>
      ELASTIC_APM_SEND_STRATEGY: background <1>
...
```

1. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

::::::

::::::{tab-item} Terraform
In your Terraform file configure the following environment variables:

```yaml
...
resource "aws_lambda_function" "your_lambda_function" {
  ...
  environment {
    variables = {
      NODE_OPTIONS                  = "-r elastic-apm-node/start"
      ELASTIC_APM_LAMBDA_APM_SERVER = "<YOUR-APM-SERVER-URL>"
      ELASTIC_APM_SECRET_TOKEN      = "<YOUR-APM-SECRET-TOKEN>"
      ELASTIC_APM_SEND_STRATEGY     = "background" <1>
    }
  }
}
...
```

1. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

::::::

::::::{tab-item} Container Image
Environment variables configured for an AWS Lambda function are passed to the container running the lambda function. You can use one of the other options (through AWS Web Console, AWS CLI, etc.) to configure the following environment variables:

```bash
NODE_OPTIONS                  = -r elastic-apm-node/start <1>
ELASTIC_APM_LAMBDA_APM_SERVER = <YOUR-APM-SERVER-URL>     <2>
ELASTIC_APM_SECRET_TOKEN      = <YOUR-APM-SECRET-TOKEN>   <3>
ELASTIC_APM_SEND_STRATEGY     = background                <4>
```

1. Use this exact fixed value.
2. This is your APM Server URL.
3. This is your APM secret token.
4. The [ELASTIC_APM_SEND_STRATEGY](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the background strategy in production environments with steady load scenarios.

::::::

:::::::
1. The [`ELASTIC_APM_SEND_STRATEGY`](apm-aws-lambda://docs/reference/aws-lambda-config-options.md#_elastic_apm_send_strategy) defines when APM data is sent to your Elastic APM backend. To reduce the execution time of your lambda functions, we recommend to use the `background` strategy in production environments with steady load scenarios.


You can optionally [fine-tune the Node.js agent](/reference/configuration.md) or the [configuration of the {{apm-lambda-ext}}](apm-aws-lambda://docs/reference/aws-lambda-config-options.md).

That’s it. After following the steps above, you’re ready to go! Your Lambda function invocations should be traced from now on.


## Features [aws-lambda-features]

The AWS Lambda instrumentation will report a transaction for all function invocations and trace any [supported modules](/reference/supported-technologies.md#compatibility-frameworks). In addition, the created transactions will capture additional data for a number of Lambda trigger types — API Gateway, SNS, SQS, S3 (when the trigger is a single event), and ELB.

A transaction will be reported for Lambda invocations that fail due to a timeout, crash, `uncaughtException`, or `unhandledRejection`. (This requires APM agent v3.45.0 or later and [Elastic’s APM Lambda extension](apm-aws-lambda://docs/reference/index.md) version 1.4.0 or later.)


## Caveats and Troubleshooting [aws-lambda-caveats]

* System and custom metrics are not collected for Lambda functions. This is both because most of those are irrelevant and because the interval-based event sending model is not suitable for FaaS environments.
* The APM agent does not yet support a Lambda handler module that uses ECMAScript modules (ESM). That means your handler file name should end with ".js" (and not have `"type": "module"` in package.json if you have one) or end with ".cjs". A handler file that uses the ".mjs" suffix will not be instrumented by the APM agent.

