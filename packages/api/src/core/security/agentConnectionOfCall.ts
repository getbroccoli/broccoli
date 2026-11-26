/** A connected agent acting for its person: its connection and the scopes its token holds. */
export interface AgentConnectionOfCall {
  id: string;
  scopes: ReadonlySet<string>;
}
