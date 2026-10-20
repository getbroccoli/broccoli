import { useQuery } from "@apollo/client/react";
import { ArrowRight, Stack, Users } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";

import {
  CompleteSetupDocument,
  ReadyStepDocument,
  type ReadyStepQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { SetupLayout, SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { AddedPeopleRing } from "./AddedPeopleRing";
import { ResetSetupDialog } from "./ResetSetupDialog";

/**
 * The last step of managed setup: the people it added and where they came from. Start
 * completes setup, which routing follows into the app; Reset setup starts over.
 */
export function ReadyStep() {
  const router = useRouter();
  // Approve and reset don't return the import's sources, so a cached answer may be stale.
  const { data } = useQuery(ReadyStepDocument, { fetchPolicy: "network-only" });
  const [completeSetup, { loading, error }] = usePayloadMutation(CompleteSetupDocument);
  const company = data?.company.name;

  const start = async () => {
    try {
      await completeSetup();
    } catch {
      return; // `error` shows it
    }
    await router.invalidate();
  };

  return (
    <SetupLayout
      step="ready"
      title={company ? t("setup.ready.heading", { company }) : t("setup.ready.title")}
      description={t("setup.ready.description")}
      width="narrow"
    >
      <SetupStepForm
        width="narrow"
        onSubmit={() => void start()}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <ResetSetupDialog />
            <Button type="submit" size="lg" className="ml-auto h-10 gap-2 px-4" disabled={loading}>
              {t(loading ? "setup.ready.starting" : "setup.ready.start")}
              <ArrowRight weight="bold" aria-hidden />
            </Button>
          </div>
        }
      >
        <AddedPeopleRing />
        {data && (
          <ul className="flex flex-wrap justify-center gap-2">
            <li className={CHIP}>
              <Users size={15} aria-hidden />
              {peopleLabel(data.import)}
            </li>
            {data.import.readyEmployeeSources.length > 0 && (
              <li className={CHIP}>
                <Stack size={15} aria-hidden />
                {sourcesLabel(data.import.readyEmployeeSources)}
              </li>
            )}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {t("setup.ready.failed")}
          </p>
        )}
      </SetupStepForm>
    </SetupLayout>
  );
}

const CHIP =
  "inline-flex h-8 items-center gap-2 rounded-full bg-brand-soft/70 px-3 text-sm font-medium text-brand-deep tabular-nums";

function peopleLabel({ readyEmployeeCount }: ReadyStepQuery["import"]): string {
  return readyEmployeeCount === 1
    ? t("setup.ready.peopleOne")
    : t("setup.ready.people", { count: String(readyEmployeeCount) });
}

/** Where the added people came from, such as "From Slack and 2 files". */
function sourcesLabel(sources: ReadyStepQuery["import"]["readyEmployeeSources"]): string {
  const fromSlack = sources.some(({ kind }) => kind === "SLACK");
  const files = sources.filter(({ kind }) => kind === "FILE").length;
  if (files === 0) {
    return t("setup.ready.fromSlack");
  }
  if (files === 1) {
    return t(fromSlack ? "setup.ready.fromSlackAndFile" : "setup.ready.fromFile");
  }
  const count = String(files);
  return fromSlack
    ? t("setup.ready.fromSlackAndFiles", { count })
    : t("setup.ready.fromFiles", { count });
}
