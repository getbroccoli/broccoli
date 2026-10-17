import { t } from "@/i18n";

/** How whoever runs the server frees setup held by a browser they no longer have. */
export function SetupInProgress() {
  return (
    <p className="text-sm text-foreground/70">
      {t("setup.inProgress.reset")}{" "}
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">
        docker compose exec broccoli reset-setup
      </code>
    </p>
  );
}
