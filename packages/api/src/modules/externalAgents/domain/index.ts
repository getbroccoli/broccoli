export {
  type ExternalAgentConnection,
  parseExternalAgentClientName,
} from "./externalAgentConnection";
export { isExternalAgentSafeOrigin } from "./externalAgentOrigin";
export {
  EXTERNAL_AGENT_CODE_HOURS,
  EXTERNAL_AGENT_SESSION_HOURS,
  hashExternalAgentSecret,
  hoursAfter,
  newExternalAgentSecret,
} from "./externalAgentSecrets";
