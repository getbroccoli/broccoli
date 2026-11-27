// Public values.
export { permissionProfileRepository, userPermissionProfiles } from "./db";
export { OPERATIONS, parseGivenProfiles, PERMISSION_PROFILES, profilesOf } from "./permissions";
export { inRecordScope, isInRecordScope } from "./recordScope";
export { PrincipalSecurityContext, requireSignedIn } from "./securityContext";
export {
  AGENT_WRITE_SCOPE,
  type AgentConnectionOfCall,
  requireAgentWriteScope,
} from "./agentConnectionOfCall";

// Public types.
export type {
  Grant,
  Operation,
  PermissionObject,
  PermissionObjects,
  PermissionProfile,
  ProfileDefinition,
  RecordAction,
  RecordScope,
  Subject,
} from "./permissions";
export type {
  EmployeeDirectory,
  RecordAccess,
  RequestSecurity,
  SecurityContext,
  SecurityResolver,
  SignedInUser,
} from "./securityContext";
