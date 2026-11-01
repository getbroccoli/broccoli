import { toast } from "sonner";

import { ChooseEmployeeManagerDocument, ImportReviewDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { type PersonOption, personName } from "@/features/employees";
import { t } from "@/i18n";

/**
 * Chooses one import employee as the manager of others, or none with null, then says so in a toast;
 * a failure shows in a toast too. Resolves once it is saved.
 */
export function useChooseManager() {
  const [chooseManager, { loading }] = usePayloadMutation(ChooseEmployeeManagerDocument, {
    refetch: [ImportReviewDocument],
  });
  const choose = async (employeeIds: string[], manager: PersonOption | null) => {
    try {
      await chooseManager({
        variables: { input: { employeeIds, managerId: manager?.id ?? null } },
      });
    } catch {
      toast.error(t("setup.review.manager.failed"));
      return false;
    }
    // The server skips the manager among the people.
    const count = employeeIds.filter((id) => id !== manager?.id).length;
    const people =
      count === 1 ? t("setup.review.countOne") : t("setup.review.count", { count: String(count) });
    toast(
      manager
        ? t("setup.review.manager.set", { name: personName(manager), people })
        : t("setup.review.manager.cleared", { people }),
    );
    return true;
  };
  return { choose, loading };
}
