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
