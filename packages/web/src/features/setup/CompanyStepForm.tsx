import { useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import {
  CompanyStepDocument,
  UpdateCompanyDocument,
  type CompanyStepQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { LogoField } from "./LogoField";
import { setupStepPage } from "./requireSetupStep";
import { SetupStepForm } from "./SetupStepForm";

// The API's rule, so a name it refuses is caught here with the field's own message.
const companyStepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, t("setup.company.nameRequired"))
    .max(100, t("setup.company.nameTooLong")),
});

/** The company step: the owner names the company and may add a logo. */
export function CompanyStepForm() {
  const { data, error, refetch } = useQuery(CompanyStepDocument);

  if (data) {
    return <CompanyForm company={data.company} onLogoUploaded={refetch} />;
  }
  return (
    <SetupStepForm onSubmit={() => {}} footer={<SubmitButton isSubmitting={false} disabled />}>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("setup.company.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("setup.company.retry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row">
          <Skeleton className="size-24 rounded-[28%]" />
          <Skeleton className="h-12 flex-1 rounded-xl sm:mt-7" />
        </div>
      )}
    </SetupStepForm>
  );
}

interface CompanyFormProps {
  company: CompanyStepQuery["company"];
  onLogoUploaded: () => Promise<unknown>;
}

/** Saving company details continues setup, including when returning from the AI step. */
function CompanyForm({ company, onLogoUploaded }: CompanyFormProps) {
  const navigate = useNavigate();
  const { mode } = useRouteContext({ from: "__root__" });
  const [updateCompany] = usePayloadMutation(UpdateCompanyDocument);
  const [logoBusy, setLogoBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: { name: company.name ?? company.suggestedName ?? "" },
    validators: { onSubmit: companyStepSchema },
    onSubmitInvalid: () => nameInput.current?.focus(),
    onSubmit: async ({ value }) => {
      setFailed(false);
      try {
        await updateCompany({ variables: { input: { name: value.name } } });
      } catch {
        setFailed(true);
        return;
      }
      await navigate({ to: setupStepPage("IMPORT", mode) });
    },
  });
  // The name stays as sent while it is saved.
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isFilledIn = useStore(form.store, ({ values }) => values.name.trim() !== "");

  return (
    <SetupStepForm
      onSubmit={() => void form.handleSubmit()}
      footer={<SubmitButton isSubmitting={isSubmitting} disabled={!isFilledIn || logoBusy} />}
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <LogoField
          logoUrl={company.logoUrl ?? null}
          disabled={isSubmitting}
          onBusyChange={setLogoBusy}
          onUploaded={onLogoUploaded}
        />
        <form.Field name="name">
          {(field) => {
            const error = field.state.meta.errors[0]?.message;
            return (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="company-name">{t("setup.company.name")}</Label>
                <Input
                  ref={nameInput}
                  id="company-name"
                  name="organization"
                  autoComplete="organization"
                  autoFocus
                  readOnly={isSubmitting}
                  className="h-12 rounded-xl bg-muted/30 px-4"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={error !== undefined}
                  aria-describedby={error ? "company-name-error" : undefined}
                />
                <FieldError id="company-name-error" message={error} />
              </div>
            );
          }}
        </form.Field>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.company.failed")}
        </p>
      )}
    </SetupStepForm>
  );
}

function SubmitButton({ isSubmitting, disabled }: { isSubmitting: boolean; disabled: boolean }) {
  return (
    <Button type="submit" size="lg" className="h-10 gap-2 px-4" disabled={isSubmitting || disabled}>
      {t(isSubmitting ? "setup.company.submitting" : "setup.company.submit")}
      <ArrowRight weight="bold" aria-hidden />
    </Button>
  );
}
