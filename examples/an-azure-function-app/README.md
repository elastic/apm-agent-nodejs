This directory holds a very small Azure Function App implemented in Node.js
and setup to be traced by the Elastic APM agent. The App has two "functions":

1. `Hi` - an HTTP-triggered function that will call the `Bye` function, then
   respond with `{"hi":"there"}`.
2. `Bye` - an HTTP-triggered function that will respond with `{"good":"bye"}`.


# Testing locally

1. Have an APM server to send tracing data to. If you don't have one,
   [start here](https://www.elastic.co/guide/en/apm/guide/current/apm-quick-start.html).

2. Install the [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools),
   which provide a `func` CLI tool for running Azure Functions locally for
   development, and for publishing an Function App to Azure. One way to
   install is via:

        npm install -g azure-functions-core-tools@4

    It is recommended that you **not** install it in the local `./node_modules`
    folder, but they will get in the way of publishing to Azure.

3. Set environment variable to configure the APM agent, for example:

    ```
    export ELASTIC_APM_SERVER_URL=https://...
    export ELASTIC_APM_SECRET_TOKEN=...
    ```

4. `npm start`

5. In a separate terminal, call the Azure Function via:

    ```
    curl -i http://localhost:7071/api/Hello
    ```


# Testing on Azure

1. To run this Azure Function App on Azure itself you will need to have an Azure
   account and create some supporting resources. For [this Azure guide](https://learn.microsoft.com/en-us/azure/azure-functions/create-first-function-cli-node#create-supporting-azure-resources-for-your-function).

2. Deploy the function app via `func azure functionapp publish <APP_NAME>`.

3. Configure the `ELASTIC_APM_SERVER_URL` and `ELASTIC_APM_SECRET_TOKEN` environment
   variables in the "Configuration" settings page of the Azure Portal.

4. Call your functions:

    ```
    curl -i https://<APP_NAME>.azurewebsites.net/api/hi
    ```

The result (after a minute for data to propagate) should be a `<APP_NAME>` service
in the Kibana APM app with traces of all function invocations.
