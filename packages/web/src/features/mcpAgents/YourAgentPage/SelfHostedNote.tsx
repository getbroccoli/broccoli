import { t } from "@/i18n";

const SETUP_GUIDE_URL =
  "https://github.com/getbroccoli/broccoli/blob/main/docs/guides/setup-guide.md";

/** On a self-hosted instance, agents keep working only at the address they connected to. */
export function SelfHostedNote() {
  return (
    <p className="text-xs text-muted-foreground">
      {t("mcpAgents.selfHosted")}{" "}
      <a
        href={SETUP_GUIDE_URL}
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline underline-offset-2"
      >
        {t("mcpAgents.selfHosted.guide")}
      </a>
    </p>
  );
}
