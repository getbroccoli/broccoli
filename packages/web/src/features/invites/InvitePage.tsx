import { Link } from "@tanstack/react-router";
import { type ComponentType, type ReactNode, useState } from "react";

import { t } from "@/i18n";

import { InviteForm } from "./InviteForm";
import { useInviteLookup } from "./useInviteLookup";

type Props = {
  /** The page's frame, such as the shell's auth card. */
  Card: ComponentType<{ title: string; description: string; children: ReactNode }>;
};

/** The page an invite link opens: the join form, or why the link opens nothing. */
export function InvitePage({ Card }: Props) {
  const lookup = useInviteLookup();
  // The link can stop working while the page is open, such as when it was used in another tab.
  const [usedMeanwhile, setUsedMeanwhile] = useState(false);
  if (lookup.state === "loading") {
    return null;
  }
  if (lookup.state === "failed") {
    return (
      <Card title={t("invites.page.failed")} description={t("invites.page.failedDetail")}>
        {null}
      </Card>
    );
  }
  if (lookup.state === "invalid" || usedMeanwhile) {
    return (
      <Card title={t("invites.invalid.title")} description={t("invites.invalid.detail")}>
        <Link
          to="/login"
          search={{ redirect: "/me" }}
          className="text-sm font-medium underline underline-offset-2"
        >
          {t("invites.invalid.signIn")}
        </Link>
      </Card>
    );
  }
  const { details } = lookup;
  return (
    <Card
      title={
        details.inviterFirstName
          ? t("invites.page.title", {
              name: details.firstName,
              inviter: details.inviterFirstName,
              company: details.companyName,
            })
          : t("invites.page.titleNoInviter", {
              name: details.firstName,
              company: details.companyName,
            })
      }
      description={t("invites.page.description")}
    >
      <InviteForm token={lookup.token} details={details} onInvalid={() => setUsedMeanwhile(true)} />
    </Card>
  );
}
