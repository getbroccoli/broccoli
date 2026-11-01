import {
  ChooseEmployeeValueDocument,
  ImportReviewDocument,
  type ManagerCell_ManagerFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { t } from "@/i18n";

import { fieldLabel } from "./employeeFields";
import { ImportPersonSearch } from "./ImportPersonSearch";
import { SourceIcon } from "./SourceIcon";
import { useChooseManager } from "./useChooseManager";

type Props = {
  employeeId: string;
  employeeName: string;
  manager: ManagerCell_ManagerFragment;
  onDone: () => void;
};

/**
 * Says why a manager gives no one at Approve, picks one source's manager while the files disagree,
 * and chooses a person, or no manager, over what the files say.
 */
export function ManagerPopover({ employeeId, employeeName, manager, onDone }: Props) {
  const { reference, employee, chosen, problem } = manager;
  const [chooseValue, picking] = usePayloadMutation(ChooseEmployeeValueDocument, {
    refetch: [ImportReviewDocument],
  });
  const { choose, loading } = useChooseManager();
  const busy = picking.loading || loading;
  // A pick, or none, puts the files' manager back.
  const pickSource = (recordId?: string) =>
    void chooseValue({ variables: { input: { employeeId, field: "MANAGER", recordId } } }).then(
      onDone,
      () => undefined, // `picking.error` shows it
    );

  return (
    <>
      <PopoverHeader>
        <PopoverTitle className="text-base">
          {t("setup.review.fieldTitle", { field: fieldLabel("manager"), name: employeeName })}
        </PopoverTitle>
        {problem && (
          <PopoverDescription className="text-sm leading-[1.5]">
            {chosen
              ? t("setup.review.manager.problemChosen")
              : t(`setup.review.manager.problem.${problem}`, { reference: reference.value ?? "" })}
          </PopoverDescription>
        )}
      </PopoverHeader>
      {!chosen && reference.options.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("setup.review.manager.fromSources")}
          </p>
          {reference.options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              className="h-10 justify-start gap-3 px-3 text-sm"
              disabled={busy}
              aria-pressed={reference.value === option.value}
              onClick={() => pickSource(option.records[0]!.id)}
            >
              <SourceIcon source={option.records[0]!.source} />
              <span className="truncate font-medium">{option.value}</span>
            </Button>
          ))}
        </div>
      )}
      {chosen && reference.options.length > 0 && (
        <Button
          type="button"
          variant="link"
          className="h-auto self-start p-0"
          disabled={busy}
          onClick={() => pickSource()}
        >
          {t("setup.review.manager.useSources")}
        </Button>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("setup.review.manager.choose")}
        </p>
        <div className="rounded-lg border border-border">
          <ImportPersonSearch
            label={t("setup.review.manager.choose")}
            excludedId={employeeId}
            selectedId={employee?.id ?? ""}
            onPick={(person) => void choose([employeeId], person).then(onDone)}
          />
        </div>
      </div>
      {picking.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.review.saveFailed")}
        </p>
      )}
    </>
  );
}
