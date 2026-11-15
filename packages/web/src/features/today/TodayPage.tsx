import { useFragment } from "@apollo/client/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import { Today_EmployeeFragmentDoc } from "@/__generated__/graphql";
import { AgentInvitation } from "@/features/mcpAgents";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

import { partOfDay } from "./partOfDay";

/** The home page: a greeting and what needs the person today, for now the invitation to connect their agent. */
export function TodayPage() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  // The session already read the employee, so the greeting renders at once.
  const employee = useFragment({ fragment: Today_EmployeeFragmentDoc, from: me.employee });
  const firstName = me.employee && employee.complete ? employee.data.firstName : null;
  const part = partOfDay(new Date());

  return (
    <div className="flex max-w-3xl flex-col">
      <PageHeader
        title={
          firstName
            ? t(`today.greeting.${part}.named`, { name: firstName })
            : t(`today.greeting.${part}`)
        }
        description={t("today.description")}
      />
      <AgentInvitation
        otherwise={
          <p className="text-sm text-muted-foreground">
            {t("today.nothingNew")}{" "}
            <Link to="/tasks" className="font-medium text-foreground underline underline-offset-4">
              {t("today.seeTasks")}
            </Link>
          </p>
        }
      />
    </div>
  );
}
