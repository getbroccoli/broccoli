import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  PaperPlaneTilt,
  ShieldCheck,
  UserCircleGear,
  UsersThree,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  type SetupInviteAudience,
  SetupOwnerPersonDocument,
  SetupAudiencesDocument,
} from "@/__generated__/graphql";
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
import { AudienceOption } from "./AudienceOption";
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
  // Undefined until the owner picks here: then their earlier answer, else the person with their email.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>();
  const [changing, setChanging] = useState(false);
  const [audience, setAudience] = useState<SetupInviteAudience>(search.audience);
  const { data, error } = useQuery(SetupOwnerPersonDocument, {
    // No import employee has an empty key, so without an answer `chosen` is null.
    variables: { me: search.me ?? "" },
    fetchPolicy: "cache-and-network",
  });
  const navigate = useNavigate();
  const { next } = useSetupPages("who");

  const earlier = search.me === undefined ? data?.import.ownerCandidate : data?.import.chosen;
  const me =
    picked === undefined
      ? earlier
        ? { id: earlier.id, name: setupPersonName(earlier) }
        : null
      : picked;
  const audiences = useQuery(SetupAudiencesDocument, {
    skip: !data,
    variables: { me: me?.id ?? null },
    fetchPolicy: "cache-and-network",
  });
  const counted = audiences.data ?? audiences.previousData;
  const managers = counted?.import.managers ?? [];
  const everyone = counted?.import.everyone.length ?? 0;

  const invited = audience === "EVERYONE" ? everyone : managers.length;
  const count = (n: number) => ({ count: String(n) });

  const choose = () => void navigate({ to: next, search: { audience, me: me?.id ?? null } });

  return (
    <SetupLayout
      step="who"
      title={t("setup.who.title")}
      description={t("setup.who.description")}
      width="wide"
    >
      <SetupStepForm
        width="wide"
        onSubmit={choose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <BackToReview />
            <Button
              type="submit"
              size="lg"
              className="ml-auto h-10 gap-2 px-4"
              disabled={!data || !counted}
            >
              {t("setup.who.continue")}
              <ArrowRight weight="bold" aria-hidden />
            </Button>
          </div>
        }
      >
        <p className="-mt-4 flex items-center gap-2.5 self-start rounded-xl bg-brand-soft/60 px-4 py-3 text-[15px] text-brand-deep">
          <PaperPlaneTilt size={18} className="shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{t("setup.who.nothingSent")}</span>{" "}
            {t("setup.who.nothingSentDetail")}
          </span>
        </p>
        <fieldset className="flex flex-col gap-6">
          <legend className="sr-only">{t("setup.who.title")}</legend>
          <div className="grid gap-3 md:grid-cols-3">
            <AudienceOption
              value="ONLY_ADMINS"
              chosen={audience}
              onChoose={setAudience}
              icon={ShieldCheck}
              title={t("setup.who.onlyAdmins")}
              who={t("setup.who.onlyAdminsWho")}
              can={[t("setup.who.onlyAdminsCanRecords"), t("setup.who.onlyAdminsCanInvite")]}
              cannot={t("setup.who.onlyAdminsCannot")}
            />
            <AudienceOption
              value="ADMINS_AND_MANAGERS"
              chosen={audience}
              onChoose={setAudience}
              disabled={counted !== undefined && managers.length === 0}
              icon={UserCircleGear}
              title={t("setup.who.adminsAndManagers")}
              who={
                counted && managers.length === 0
                  ? t("setup.who.noManagers")
                  : managers.length === 1
                    ? t("setup.who.adminsAndManagersWhoOne")
                    : t("setup.who.adminsAndManagersWho", count(managers.length))
              }
              can={[t("setup.who.managersCanSee"), t("setup.who.managersCanEdit")]}
              cannot={t("setup.who.adminsAndManagersCannot")}
            />
            <AudienceOption
              value="EVERYONE"
              chosen={audience}
              onChoose={setAudience}
              icon={UsersThree}
              title={t("setup.who.everyone")}
              who={
                everyone === 1
                  ? t("setup.who.everyoneWhoOne")
                  : t("setup.who.everyoneWho", count(everyone))
              }
              can={[
                t("setup.who.everyoneCanSee"),
                t("setup.who.everyoneCanEdit"),
                t("setup.who.everyoneCanManage"),
              ]}
            />
          </div>
          <div className="flex max-w-[62ch] flex-col gap-2 text-[15px] leading-[1.55] text-muted-foreground">
            <p>
              {audience === "ONLY_ADMINS"
                ? t("setup.who.noInvites")
                : invited === 1
                  ? t("setup.who.invitesLaterOne")
                  : t("setup.who.invitesLater", count(invited))}
            </p>
            {audience === "ADMINS_AND_MANAGERS" && (
              <PeopleNames people={managers.map(setupPersonName)} />
            )}
          </div>
        </fieldset>
        <section className="flex max-w-[592px] flex-col gap-3">
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
        {(error || audiences.error) && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.invites.loadFailed")}
          </p>
        )}
      </SetupStepForm>
    </SetupLayout>
  );
}
