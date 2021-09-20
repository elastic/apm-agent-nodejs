// Inlined from @types/aws-lambda
//
// These types are inlined, rather than being used from `@types/aws-lambda`
// directly, as a trade-off. It avoids needing an additional entry in
// "dependencies" just for types. It avoids TypeScript users of
// elastic-apm-node needing to manually `npm install @types/aws-lambda`.
//
// https://github.com/elastic/apm-agent-nodejs/issues/2331#issuecomment-921251030

export declare namespace AwsLambda {
  interface CognitoIdentity {
    cognitoIdentityId: string;
    cognitoIdentityPoolId: string;
  }

  interface ClientContext {
    client: ClientContextClient;
    custom?: any;
    env: ClientContextEnv;
  }

  interface ClientContextClient {
    installationId: string;
    appTitle: string;
    appVersionName: string;
    appVersionCode: string;
    appPackageName: string;
  }

  interface ClientContextEnv {
    platformVersion: string;
    platform: string;
    make: string;
    model: string;
    locale: string;
  }

  type Callback<TResult = any> = (error?: Error | null | string, result?: TResult) => void;

  interface Context {
    // Properties
    callbackWaitsForEmptyEventLoop: boolean;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: number;
    awsRequestId: string;
    logGroupName: string;
    logStreamName: string;
    identity?: CognitoIdentity;
    clientContext?: ClientContext;

    // Functions
    getRemainingTimeInMillis(): number;

    // Functions for compatibility with earlier Node.js Runtime v0.10.42
    // For more details see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-using-old-runtime.html#nodejs-prog-model-oldruntime-context-methods
    done(error?: Error, result?: any): void;
    fail(error: Error | string): void;
    succeed(messageOrObject: any): void;
    succeed(message: string, object: any): void;
  }

  type Handler<TEvent = any, TResult = any> = (
    event: TEvent,
    context: Context,
    callback: Callback<TResult>,
  ) => void | Promise<TResult>;
}
