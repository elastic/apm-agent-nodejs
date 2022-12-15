A Node.js JavaScript Azure function app to be used for testing of
elastic-apm-node.

# Notes on how this was created

- `func init AJsAzureFnApp`
- Remove "azure-functions-core-tools" devDep and move to top-level to share
  between possibly many fixtures.
- An HTTP-triggered function: `func new --name HttpFn1 --template "HTTP trigger" --authlevel "anonymous"`


# Notes on how to deploy this to Azure and sanity test it

XXX problematic because not adding elastic-apm-node dep. Better to leave
    that for "examples/..."

