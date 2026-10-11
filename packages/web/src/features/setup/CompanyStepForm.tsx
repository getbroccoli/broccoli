import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import {
  CompanyStepDocument,
  UpdateCompanyDocument,
  type CompanyStepQuery,
} from "@/__generated__/graphql";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { LogoField } from "./LogoField";
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

/**
 * Saving the name completes the company step; the router then reloads and routing
 * sends the owner on into the app.
 */
function CompanyForm({ company, onLogoUploaded }: CompanyFormProps) {
  const router = useRouter();
  const [updateCompany] = useMutation(UpdateCompanyDocument);
  const [logoBusy, setLogoBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const form = useForm({
    defaultValues: { name: company.name ?? company.suggestedName ?? "" },
    validators: { onSubmit: companyStepSchema },
    onSubmit: async ({ value }) => {
      setFailed(false);
      try {
        await updateCompany({ variables: { input: { name: value.name } } });
      } catch {
        setFailed(true);
        return;
      }
      await router.invalidate();
    },
  });

  return (
    <SetupStepForm
      onSubmit={() => void form.handleSubmit()}
      footer={
        <form.Subscribe
          selector={({ isSubmitting, values }) => ({
            isSubmitting,
            isFilledIn: values.name.trim() !== "",
          })}
        >
          {({ isSubmitting, isFilledIn }) => (
            <SubmitButton isSubmitting={isSubmitting} disabled={!isFilledIn || logoBusy} />
          )}
        </form.Subscribe>
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <form.Subscribe selector={({ isSubmitting }) => isSubmitting}>
          {(isSubmitting) => (
            <LogoField
              logoUrl={company.logoUrl ?? null}
              disabled={isSubmitting}
              onBusyChange={setLogoBusy}
              onUploaded={onLogoUploaded}
            />
          )}
        </form.Subscribe>
        <form.Field name="name">
          {(field) => {
            const error = field.state.meta.errors[0]?.message;
            return (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="company-name">{t("setup.company.name")}</Label>
                <Input
                  id="company-name"
                  name="organization"
                  autoComplete="organization"
                  autoFocus
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
