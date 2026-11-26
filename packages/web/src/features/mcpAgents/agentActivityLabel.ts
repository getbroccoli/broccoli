import { t } from "@/i18n";

type AgentCall = { tool: string; resultCount?: number | null };

/** What the agent did, in the person's words; never what it read or asked. */
export function agentActivityLabel({ tool, resultCount }: AgentCall): string {
  switch (tool) {
    case "who_am_i":
      return t("mcpAgents.activity.whoAmI");
    case "find_people":
      return resultCount === null || resultCount === undefined
        ? t("mcpAgents.activity.findPeople")
        : t("mcpAgents.activity.findPeopleFound", { count: String(resultCount) });
    case "my_leave_balance":
      return t("mcpAgents.activity.myLeaveBalance");
    case "preview_leave":
      return t("mcpAgents.activity.previewLeave");
    case "request_leave":
      return t("mcpAgents.activity.requestLeave");
    case "list_my_tasks":
      return resultCount === null || resultCount === undefined
        ? t("mcpAgents.activity.listMyTasks")
        : t("mcpAgents.activity.listMyTasksFound", { count: String(resultCount) });
    default:
      return t("mcpAgents.activity.otherTool", { tool });
  }
}
