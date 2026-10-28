import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { InviteForm, useInviteLookup } from "@/features/invites";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

/** Opened from an invite: `/invite#<token>`. Once the person joins, the route reload takes them to their profile. */
export const Route = createFileRoute("/invite")({
  beforeLoad: ({ context: { me } }) => {
    if (me?.employee) {
      throw redirect({ to: "/me", replace: true });
    }
  },
  component: function InvitePage() {
    const lookup = useInviteLookup();
    // The link can stop working while the page is open, such as when it was used in another tab.
    const [usedMeanwhile, setUsedMeanwhile] = useState(false);
    if (lookup.state === "loading") {
      return null;
    }
    if (lookup.state !== "found" || usedMeanwhile) {
      return (
        <AuthCard
          title={t(lookup.state === "failed" ? "invites.page.failed" : "invites.invalid.title")}
          description={t("invites.invalid.detail")}
        >
          <Link
            to="/login"
            search={{ redirect: "/me" }}
            className="text-sm font-medium underline underline-offset-2"
          >
            {t("invites.invalid.signIn")}
          </Link>
        </AuthCard>
      );
    }
    const { details } = lookup;
    return (
      <AuthCard
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
        <InviteForm
          token={lookup.token}
          details={details}
          onInvalid={() => setUsedMeanwhile(true)}
        />
      </AuthCard>
    );
  },
});
