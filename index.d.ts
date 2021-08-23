/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'http';
import type { Logger as PinoLogger } from 'pino';
import type * as Connect from 'connect';
import type * as AwsLambda from 'aws-lambda';

declare namespace apm {
  // Agent API
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/agent-api.html
  export interface Agent {
    // Configuration
    start (options?: AgentConfigOptions): Agent;
    isStarted (): boolean;
    getServiceName (): string | undefined;
    setFramework (options: {
      name?: string;
      version?: string;
      overwrite?: boolean;
    }): void;
    addPatch (modules: string | Array<string>, handler: string | PatchHandler): void;
    removePatch (modules: string | Array<string>, handler: string | PatchHandler): void;
    clearPatches (modules: string | Array<string>): void;

    // Data collection hooks
    middleware: { connect (): Connect.ErrorHandleFunction };
    lambda (handler: AwsLambda.Handler): AwsLambda.Handler;
    lambda (type: string, handler: AwsLambda.Handler): AwsLambda.Handler;
    handleUncaughtExceptions (
      fn?: (err: Error) => void
    ): void;

    // Errors
    captureError (
      err: Error | string | ParameterizedMessageObject,
      callback?: CaptureErrorCallback
    ): void;
    captureError (
      err: Error | string | ParameterizedMessageObject,
      options?: CaptureErrorOptions,
      callback?: CaptureErrorCallback
    ): void;

    // Distributed Tracing
    currentTraceparent: string | null;
    currentTraceIds: {
      'trace.id'?: string;
      'transaction.id'?: string;
      'span.id'?: string;
    }

    // Transactions
    startTransaction(
      name?: string | null,
      options?: TransactionOptions
    ): Transaction | null;
    startTransaction(
      name: string | null,
      type: string | null,
      options?: TransactionOptions
    ): Transaction | null;
    startTransaction(
      name: string | null,
      type: string | null,
      subtype: string | null,
      options?: TransactionOptions
    ): Transaction | null;
    startTransaction(
      name: string | null,
      type: string | null,
      subtype: string | null,
      action: string | null,
      options?: TransactionOptions
    ): Transaction | null;
    setTransactionName (name: string): void;
    endTransaction (result?: string | number, endTime?: number): void;
    currentTransaction: Transaction | null;

    // Spans
    startSpan(
      name?: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      subtype: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      subtype: string | null,
      action: string | null,
      options?: SpanOptions
    ): Span | null;
    currentSpan: Span | null;

    // Context
    setLabel (name: string, value: LabelValue, stringify?: boolean): boolean;
    addLabels (labels: Labels, stringify?: boolean): boolean;
    setUserContext (user: UserObject): void;
    setCustomContext (custom: object): void;

    // Transport
    addFilter (fn: FilterFn): void;
    addErrorFilter (fn: FilterFn): void;
    addSpanFilter (fn: FilterFn): void;
    addTransactionFilter (fn: FilterFn): void;
    addMetadataFilter (fn: FilterFn): void;
    flush (callback?: Function): void;
    destroy (): void;

    // Utils
    logger: Logger;

    // Custom metrics
    registerMetric(name: string, callback: Function): void;
    registerMetric(name: string, labels: Labels, callback: Function): void;

    setTransactionOutcome(outcome: Outcome): void;
    setSpanOutcome(outcome: Outcome): void;
  }

  type Outcome = 'unknown' | 'success' | 'failure'

  interface GenericSpan {
    // The following properties and methods are currently not documented as their API isn't considered official:
    // timestamp, ended, id, traceId, parentId, sampled, duration()

    type: string | null;
    subtype: string | null;
    action: string | null;
    traceparent: string;
    outcome: Outcome;

    setType (type?: string | null, subtype?: string | null, action?: string | null): void;
    setLabel (name: string, value: LabelValue, stringify?: boolean): boolean;
    addLabels (labels: Labels, stringify?: boolean): boolean;
  }

  // Transaction API
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/transaction-api.html
  export interface Transaction extends GenericSpan {
    // The following properties and methods are currently not documented as their API isn't considered official:
    // setUserContext(), setCustomContext(), toJSON(), setDefaultName(), setDefaultNameFromRequest()

    name: string;
    result: string | number;

    startSpan(
      name?: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      subtype: string | null,
      options?: SpanOptions
    ): Span | null;
    startSpan(
      name: string | null,
      type: string | null,
      subtype: string | null,
      action: string | null,
      options?: SpanOptions
    ): Span | null;
    ensureParentId (): string;
    end (result?: string | number | null, endTime?: number): void;

    setOutcome(outcome: Outcome): void;
  }

  // Span API
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/span-api.html
  export interface Span extends GenericSpan {
    // The following properties and methods are currently not documented as their API isn't considered official:
    // customStackTrace(), setDbContext()

    transaction: Transaction;
    name: string;

    end (endTime?: number): void;

    setOutcome(outcome: Outcome): void;
  }

  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuration.html
  export interface AgentConfigOptions {
    abortedErrorThreshold?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    active?: boolean;
    addPatch?: KeyValueConfig;
    apiKey?: string;
    apiRequestSize?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    apiRequestTime?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    asyncHooks?: boolean;
    breakdownMetrics?: boolean;
    captureBody?: CaptureBody;
    captureErrorLogStackTraces?: CaptureErrorLogStackTraces;
    captureExceptions?: boolean;
    captureHeaders?: boolean;
    captureSpanStackTraces?: boolean;
    cloudProvider?: string;
    configFile?: string;
    containerId?: string;
    disableInstrumentations?: string | string[];
    disableSend?: boolean;
    environment?: string;
    errorMessageMaxLength?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    errorOnAbortedRequests?: boolean;
    filterHttpHeaders?: boolean;
    frameworkName?: string;
    frameworkVersion?: string;
    globalLabels?: KeyValueConfig;
    hostname?: string;
    ignoreMessageQueues?: Array<string>;
    ignoreUrls?: Array<string | RegExp>;
    ignoreUserAgents?: Array<string | RegExp>;
    instrument?: boolean;
    instrumentIncomingHTTPRequests?: boolean;
    kubernetesNamespace?: string;
    kubernetesNodeName?: string;
    kubernetesPodName?: string;
    kubernetesPodUID?: string;
    logLevel?: LogLevel;
    logUncaughtExceptions?: boolean;
    logger?: PinoLogger | Logger;
    maxQueueSize?: number;
    metricsInterval?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    metricsLimit?: number;
    payloadLogFile?: string;
    centralConfig?: boolean;
    queryMaxLength?: string;
    sanitizeFieldNames?: Array<string>;
    secretToken?: string;
    serverCaCertFile?: string;
    serverTimeout?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
    serverUrl?: string;
    serviceName?: string;
    serviceNodeName?: string;
    serviceVersion?: string;
    sourceLinesErrorAppFrames?: number;
    sourceLinesErrorLibraryFrames?: number;
    sourceLinesSpanAppFrames?: number;
    sourceLinesSpanLibraryFrames?: number;
    spanFramesMinDuration?: string;
    stackTraceLimit?: number;
    transactionIgnoreUrls?: Array<string>;
    transactionMaxSpans?: number;
    transactionSampleRate?: number;
    useElasticTraceparentHeader?: boolean;
    usePathAsTransactionName?: boolean;
    verifyServerCert?: boolean;
  }

  interface CaptureErrorOptions {
    request?: IncomingMessage;
    response?: ServerResponse;
    timestamp?: number;
    handled?: boolean;
    user?: UserObject;
    labels?: Labels;
    tags?: Labels;
    custom?: object;
    message?: string;
    captureAttributes?: boolean;
    skipOutcome?: boolean;
  }

  interface Labels {
    [key: string]: LabelValue;
  }

  interface UserObject {
    id?: string | number;
    username?: string;
    email?: string;
  }

  interface ParameterizedMessageObject {
    message: string;
    params: Array<any>;
  }

  interface Logger {
    fatal (msg: string, ...args: any[]): void;
    fatal (obj: {}, msg?: string, ...args: any[]): void;
    error (msg: string, ...args: any[]): void;
    error (obj: {}, msg?: string, ...args: any[]): void;
    warn (msg: string, ...args: any[]): void;
    warn (obj: {}, msg?: string, ...args: any[]): void;
    info (msg: string, ...args: any[]): void;
    info (obj: {}, msg?: string, ...args: any[]): void;
    debug (msg: string, ...args: any[]): void;
    debug (obj: {}, msg?: string, ...args: any[]): void;
    trace (msg: string, ...args: any[]): void;
    trace (obj: {}, msg?: string, ...args: any[]): void;
    [propName: string]: any;
  }

  export interface TransactionOptions {
    startTime?: number;
    childOf?: Transaction | Span | string;
  }

  export interface SpanOptions {
    childOf?: Transaction | Span | string;
  }

  type CaptureBody = 'off' | 'errors' | 'transactions' | 'all';
  type CaptureErrorLogStackTraces = 'never' | 'messages' | 'always';
  type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'warning' | 'error' | 'fatal' | 'critical' | 'off';

  type CaptureErrorCallback = (err: Error | null, id: string) => void;
  type FilterFn = (payload: Payload) => Payload | boolean | void;
  type LabelValue = string | number | boolean | null | undefined;
  type KeyValueConfig = string | Labels | Array<Array<LabelValue>>

  type Payload = { [propName: string]: any }

  type PatchHandler = (exports: any, agent: Agent, options: PatchOptions) => any;

  interface PatchOptions {
    version: string | undefined,
    enabled: boolean
  }
}

declare const apm: apm.Agent;
export = apm
