import { Clock } from "@phosphor-icons/react";

import { t } from "@/i18n";

import { ExternalAgentPromptBlock } from "../ExternalAgentPromptBlock";

type Props = {
  /** The names of the dropped files the external agent has not picked up yet; at least one. */
  fileNames: readonly string[];
};

/**
 * Asks the owner to tell their connected external agent about files it has not picked up, in
 * case it stopped waiting for them.
 */
export function ExternalAgentNewFiles({ fileNames }: Props) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-app-backdrop p-[18px]">
      <p className="flex items-center gap-2.5 text-sm">
        <Clock size={16} aria-hidden className="shrink-0" />
        {fileNames.length === 1
          ? t("externalAgents.notPickedUpOne", { name: fileNames[0]! })
          : t("externalAgents.notPickedUpMany", { count: String(fileNames.length) })}
      </p>
      <ExternalAgentPromptBlock prompt={t("externalAgents.newFilesPrompt")} />
    </div>
  );
}
