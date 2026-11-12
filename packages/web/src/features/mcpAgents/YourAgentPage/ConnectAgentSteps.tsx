import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";

import { ClientCommand } from "./ClientCommand";
import { StepList } from "./StepList";

type Props = {
  /** The MCP address the person pastes into their agent. */
  address: string;
};

/** How to connect each kind of agent, as tabs. */
export function ConnectAgentSteps({ address }: Props) {
  return (
    <Tabs defaultValue="claude" className="gap-4">
      <TabsList aria-label={t("mcpAgents.tabs.label")} className="overflow-x-auto">
        <TabsTab value="claude" className="whitespace-nowrap">
          {t("mcpAgents.tabs.claude")}
        </TabsTab>
        <TabsTab value="chatgpt" className="whitespace-nowrap">
          {t("mcpAgents.tabs.chatgpt")}
        </TabsTab>
        <TabsTab value="cli" className="whitespace-nowrap">
          {t("mcpAgents.tabs.cli")}
        </TabsTab>
      </TabsList>
      <TabsPanel value="claude" className="flex flex-col gap-3">
        <StepList
          steps={["mcpAgents.claude.step1", "mcpAgents.claude.step2", "mcpAgents.allowInBroccoli"]}
        />
        <p className={noteClass}>{t("mcpAgents.claude.note")}</p>
      </TabsPanel>
      <TabsPanel value="chatgpt" className="flex flex-col gap-3">
        <StepList
          steps={[
            "mcpAgents.chatgpt.step1",
            "mcpAgents.chatgpt.step2",
            "mcpAgents.allowInBroccoli",
          ]}
        />
        <p className={noteClass}>{t("mcpAgents.chatgpt.note")}</p>
      </TabsPanel>
      <TabsPanel value="cli" className="flex flex-col gap-4">
        <ClientCommand
          client={t("mcpAgents.cli.claudeCode")}
          line={`claude mcp add --transport http broccoli ${address}`}
          then={t("mcpAgents.cli.claudeCodeThen")}
        />
        <ClientCommand
          client={t("mcpAgents.cli.codex")}
          line={`codex mcp add broccoli --url ${address}`}
          then={t("mcpAgents.cli.codexThen")}
        />
        <p className={noteClass}>{t("mcpAgents.cli.other")}</p>
      </TabsPanel>
    </Tabs>
  );
}

const noteClass = "text-xs leading-relaxed text-muted-foreground";
