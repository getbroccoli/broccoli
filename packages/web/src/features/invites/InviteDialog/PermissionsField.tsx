import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  admin: boolean;
  onAdminChange: (admin: boolean) => void;
};

/** The permissions an invite gives: always an employee's, and an admin's when chosen. */
export function PermissionsField({ admin, onAdminChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t("invites.dialog.permissions")}</legend>
      <Label className="font-normal">
        <Checkbox checked disabled />
        {t("invites.dialog.employee")}
        <span className="text-muted-foreground">{t("invites.dialog.employeeHint")}</span>
      </Label>
      <Label className="font-normal">
        <Checkbox checked={admin} onCheckedChange={onAdminChange} />
        {t("invites.dialog.admin")}
        <span className="text-muted-foreground">{t("invites.dialog.adminHint")}</span>
      </Label>
    </fieldset>
  );
}
