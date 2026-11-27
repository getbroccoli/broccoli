import { UserSwitch } from "@phosphor-icons/react";
import { toast } from "sonner";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import { actAs } from "./actingAsApi";
import { useActingAsChange } from "./useActingAsChange";

type Props = {
  person: { id: string; firstName: string; lastName: string };
};

/** "Act as" in a person's ⋯ menu: Broccoli then opens Today as them. */
export function ActAsMenuItem({ person }: Props) {
  const name = `${person.firstName} ${person.lastName}`;
  // A toast, since the menu closes on the click and takes this item with it.
  const { change: start, pending } = useActingAsChange(async () => {
    const result = await actAs(person.id);
    if (result === "notAllowed") toast.error(t("actingAs.notAllowed", { name }));
    if (result === "failed") toast.error(t("actingAs.startFailed", { name }));
    return result === "ok";
  });
  return (
    <DropdownMenuItem disabled={pending} onClick={() => start()}>
      <UserSwitch size={14} />
      <span className="truncate">{t("actingAs.menu", { name })}</span>
    </DropdownMenuItem>
  );
}
