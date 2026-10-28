import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { formatExpiryDay } from "../signInStatus";
import { CopyButton } from "./CopyButton";

/** A new invite's link, shown only once. */
export interface CopiedLink {
  id: string;
  name: string;
  link: string;
  expiresAt: string;
}

type Props = {
  links: CopiedLink[];
  onDone: () => void;
};

/** The links of new invites, shown once: each person's own, or all as a list. */
export function CopyLinks({ links, onDone }: Props) {
  const date = formatExpiryDay(links[0]!.expiresAt);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {links.length === 1
            ? t("invites.links.titleOne")
            : t("invites.links.title", { count: String(links.length) })}
        </DialogTitle>
        <DialogDescription>{t("invites.links.detail", { date })}</DialogDescription>
      </DialogHeader>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("invites.links.warning")}</p>
      <ul className="subtle-scrollbar flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {links.map(({ id, name, link }) => (
          <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <CopyButton text={link} label={t("invites.links.copy")} />
          </li>
        ))}
      </ul>
      <DialogFooter>
        {links.length > 1 && (
          <CopyButton
            text={links.map(({ name, link }) => `${name}: ${link}`).join("\n")}
            label={t("invites.links.copyAll")}
          />
        )}
        <Button onClick={onDone}>{t("invites.links.done")}</Button>
      </DialogFooter>
    </>
  );
}
