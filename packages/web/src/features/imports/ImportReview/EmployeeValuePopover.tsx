import { useState } from "react";

import {
  ChooseEmployeeValueDocument,
  type EmployeeValueCell_ValueFragment,
  type ImportChooseEmployeeValueInput,
  ImportReviewDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";

import { type EmployeeFieldKey, FIELD_ENUMS, fieldLabel, valuesLabel } from "./employeeFields";
import { SourceIcon } from "./SourceIcon";

type Choice = Pick<ImportChooseEmployeeValueInput, "recordId" | "value">;

/** Picks one source's value with one click, as the setup design does, or takes a typed one. */
export function EmployeeValuePopover({
  employeeId,
  employeeName,
  field,
  value,
  onDone,
}: {
  employeeId: string;
  employeeName: string;
  field: EmployeeFieldKey;
  value: EmployeeValueCell_ValueFragment;
  onDone: () => void;
}) {
  const [chooseValue, { loading, payloadError, error }] = usePayloadMutation(
    ChooseEmployeeValueDocument,
    { refetch: [ImportReviewDocument] },
  );
  const disagree = value.options.length > 1;
  const [typing, setTyping] = useState(!disagree);
  // A value no source disputes starts as it is shown, ready to correct.
  const [typed, setTyped] = useState(
    value.choice === "TYPED" || !disagree ? (value.value ?? "") : "",
  );

  const choose = (choice: Choice) =>
    void chooseValue({
      variables: { input: { employeeId, field: FIELD_ENUMS[field], ...choice } },
    }).then(
      onDone,
      () => undefined, // `payloadError` or `error` shows it
    );

  const fieldError =
    payloadError?.__typename === "InvalidInputError" ? payloadError.fields[0] : undefined;

  return (
    <>
      <PopoverHeader>
        <PopoverTitle className="text-base">
          {disagree
            ? t("setup.review.conflictTitle", {
                name: employeeName,
                values: valuesLabel(field, value.options.length),
              })
            : t("setup.review.fieldTitle", { field: fieldLabel(field), name: employeeName })}
        </PopoverTitle>
        {disagree && (
          <PopoverDescription className="text-sm leading-[1.5]">
            {disagreement(value)}
          </PopoverDescription>
        )}
      </PopoverHeader>
      {disagree && (
        <div className="flex flex-col gap-2">
          {value.options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              className="h-12 justify-start gap-3 px-3 text-sm"
              disabled={loading}
              aria-pressed={value.choice !== "TYPED" && value.value === option.value}
              onClick={() => choose({ recordId: option.records[0]!.id })}
            >
              <SourceIcon kind={option.records[0]!.source.kind} />
              <span className="truncate font-medium">{display(field, option.value)}</span>
              <span className="ml-auto truncate font-normal text-muted-foreground">
                {sourceNames(option)}
              </span>
            </Button>
          ))}
        </div>
      )}
      {!typing ? (
        <Button
          type="button"
          variant="link"
          className="h-auto self-start p-0"
          onClick={() => setTyping(true)}
        >
          {t("setup.review.typeAnother")}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            choose({ value: typed });
          }}
        >
          <div className="flex gap-2">
            {field === "startDate" ? (
              <DatePicker
                autoFocus
                aria-label={fieldLabel(field)}
                aria-invalid={Boolean(fieldError)}
                placeholder={t("setup.review.pickDate")}
                value={typed}
                onChange={setTyped}
              />
            ) : (
              <Input
                autoFocus
                aria-label={fieldLabel(field)}
                aria-invalid={Boolean(fieldError)}
                // Not `type="email"`: the browser's own check would hide the employee rule's message.
                inputMode={field === "email" ? "email" : undefined}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
            <Button type="submit" disabled={loading}>
              {t("setup.review.save")}
            </Button>
          </div>
          {value.choice === "TYPED" && (
            <p className="text-xs text-muted-foreground">{t("setup.review.typed")}</p>
          )}
        </form>
      )}
      {(fieldError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {fieldError ? errorMessage(field, fieldError.code) : t("setup.review.saveFailed")}
        </p>
      )}
    </>
  );
}

/** "staff.csv and Slack disagree…", or a general line for three sources or more. */
function disagreement({ options }: EmployeeValueCell_ValueFragment): string {
  const names = [
    ...new Set(options.flatMap(({ records }) => records.map(({ source }) => source.name))),
  ];
  return names.length === 2
    ? t("setup.review.twoSourcesDisagree", { first: names[0]!, second: names[1]! })
    : t("setup.review.sourcesDisagree");
}

function sourceNames({ records }: EmployeeValueCell_ValueFragment["options"][number]): string {
  return [...new Set(records.map(({ source }) => source.name))].join(", ");
}

function display(field: EmployeeFieldKey, value: string): string {
  return field === "startDate" ? (formatCalendarDate(value) ?? value) : value;
}

function errorMessage(field: EmployeeFieldKey, code: string): string {
  if (code === "invalid" && field === "email") {
    return t("setup.review.error.invalidEmail");
  }
  if (code === "invalid" && field === "startDate") {
    return t("setup.review.error.invalidDate");
  }
  if (code === "required" || code === "too_long" || code === "taken") {
    return t(`setup.review.error.${code}`);
  }
  return t("setup.review.error.invalid");
}
