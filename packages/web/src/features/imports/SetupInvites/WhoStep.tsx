import { useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { type SetupInviteAudience, WhoUsesBroccoliDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { personName } from "@/features/employees";
import {
  type SetupInviteSearch,
  SetupLayout,
  SetupStepForm,
  useSetupPages,
} from "@/features/setup";
import { t } from "@/i18n";

import { BackToReview } from "../BackToReview";
import { ImportPersonSearch } from "../ImportReview/ImportPersonSearch";
import { PeopleNames } from "./PeopleNames";
import { setupPersonName } from "./setupPersonName";

type Props = {
  /** What the owner chose before, when they came back from the last page. */
  search: SetupInviteSearch;
};

/**
 * "Who uses Broccoli", after Approve: which imported person the owner is, and who gets an invite
 * when setup finishes. Nothing is sent here; Continue carries both answers to the last page.
 */
export function WhoStep({ search }: Props) {
  // Undefined until the owner picks: their earlier answer, else the person with their email.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>();
  const [changing, setChanging] = useState(false);
  const [audience, setAudience] = useState<SetupInviteAudience>(search.audience);
  const { data } = useQuery(WhoUsesBroccoliDocument, {
    variables: { me: search.me, meSearch: search.me },
    fetchPolicy: "cache-and-network",
  });
  const navigate = useNavigate();
  const { next } = useSetupPages("who");

  const earlier = search.me
    ? data?.import.chosen.edges.find(({ node }) => node.id === search.me)?.node
    : data?.import.ownerCandidate;
  const me =
    picked === undefined
      ? earlier
        ? { id: earlier.id, name: setupPersonName(earlier) }
        : null
      : picked;
  const managers = (data?.import.managers ?? []).filter(({ id }) => id !== me?.id);
  const everyone = (data?.import.everyone ?? []).filter(({ id }) => id !== me?.id).length;

  const choose = () => void navigate({ to: next, search: { audience, me: me?.id ?? null } });

  return (
    <SetupLayout
      step="who"
      title={t("setup.who.title")}
      description={t("setup.who.description")}
      width="narrow"
    >
      <SetupStepForm
        width="narrow"
        onSubmit={choose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <BackToReview />
            <Button type="submit" size="lg" className="ml-auto h-10 gap-2 px-4" disabled={!data}>
              {t("setup.who.continue")}
              <ArrowRight weight="bold" aria-hidden />
            </Button>
          </div>
        }
      >
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("setup.who.youTitle")}</h2>
          {!changing && (
            <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <p className="text-sm">{me ? me.name : t("setup.who.notInList")}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
                {t("setup.who.change")}
              </Button>
            </div>
          )}
          {changing && (
            <div className="rounded-xl border">
              <ImportPersonSearch
                label={t("setup.who.youTitle")}
                selectedId={me?.id ?? ""}
                onPick={(person) => {
                  setPicked(person && { id: person.id, name: personName(person) });
                  setChanging(false);
                }}
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground">{t("setup.who.youHint")}</p>
        </section>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">{t("setup.who.audienceTitle")}</legend>
          <AudienceOption
            value="ONLY_ADMINS"
            chosen={audience}
            onChoose={setAudience}
            title={t("setup.who.onlyAdmins")}
            detail={t("setup.who.onlyAdminsDetail")}
          />
          <AudienceOption
            value="ADMINS_AND_MANAGERS"
            chosen={audience}
            onChoose={setAudience}
            disabled={data !== undefined && managers.length === 0}
            title={t("setup.who.adminsAndManagers")}
            detail={
              data && managers.length === 0
                ? t("setup.who.noManagers")
                : managers.length === 1
                  ? t("setup.who.adminsAndManagersDetailOne")
                  : t("setup.who.adminsAndManagersDetail", { count: String(managers.length) })
            }
          >
            <PeopleNames people={managers.map(setupPersonName)} />
          </AudienceOption>
          <AudienceOption
            value="EVERYONE"
            chosen={audience}
            onChoose={setAudience}
            title={t("setup.who.everyone")}
            detail={
              everyone === 1
                ? t("setup.who.everyoneDetailOne")
                : t("setup.who.everyoneDetail", { count: String(everyone) })
            }
          />
        </fieldset>
      </SetupStepForm>
    </SetupLayout>
  );
}

type AudienceOptionProps = {
  value: SetupInviteAudience;
  chosen: SetupInviteAudience;
  onChoose: (audience: SetupInviteAudience) => void;
  title: string;
  detail: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

/** One answer to "Who should use Broccoli?": who it includes and what they can do. */
function AudienceOption({
  value,
  chosen,
  onChoose,
  title,
  detail,
  disabled,
  children,
}: AudienceOptionProps) {
  const id = `audience-${value}`;
  return (
    <div className="flex gap-3 rounded-xl border px-4 py-3 has-checked:border-primary has-disabled:opacity-60">
      <input
        id={id}
        type="radio"
        name="audience"
        className="mt-1"
        checked={chosen === value}
        disabled={disabled}
        onChange={() => onChoose(value)}
        aria-describedby={`${id}-detail`}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        <p id={`${id}-detail`} className="text-sm text-muted-foreground">
          {detail}
        </p>
        {children}
      </div>
    </div>
  );
}
