import Agent_, { AgentConfigOptions as AgentConfigOptions_ } from './lib/agent';

// The export is a singleton instance of the `Agent` class.
declare const agent: Agent_;
export = agent

// Re-export some public API types.
declare namespace agent {
  export type Agent = Agent_;
  export type AgentConfigOptions = AgentConfigOptions_;
  // ...
}


// // XXX option B: define everything in index.d.ts like we have now. -> Rejected
// declare interface Agent {
//   start (options?: agent.AgentConfigOptions): Agent;
//   isStarted (): boolean;
//   // ...
// }
// declare const agent: Agent;
// export = agent
// // Re-export some public API types.
// declare namespace agent {
//   export interface AgentConfigOptions {
//     abortedErrorThreshold?: string;
//     active?: boolean;
//     captureExceptions?: boolean;
//     serviceName?: string;
//     // ...
//   }
//   // ...
// }
