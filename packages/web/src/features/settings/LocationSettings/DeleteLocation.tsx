import { toast } from "sonner";

import { DeleteLocationDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { forgetLocation } from "../cache";

type Props = {
  location: { id: string; name: string; peopleCount: number };
  disabled: boolean;
  onDeleted: () => void;
};

/** Deletes a location nobody is in; with people in it, says why it can't. */
export function DeleteLocation({ location, disabled, onDeleted }: Props) {
  const [deleteLocation, deletion] = usePayloadMutation(DeleteLocationDocument, {
    update: (cache, { data }) => {
      if (data?.employees.deleteLocation.deletedLocationId) forgetLocation(cache, location.id);
    },
  });

  if (location.peopleCount > 0) {
    return (
      <p className="text-[13px] text-muted-foreground">{t("settings.locations.deleteBlocked")}</p>
    );
  }

  const remove = async () => {
    try {
      await deleteLocation({ variables: { input: { id: location.id } } });
      toast(t("settings.locations.deleted", { name: location.name }));
      onDeleted();
    } catch {
      // The refusal shows next to the button.
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={disabled || deletion.loading}
        onClick={() => void remove()}
      >
        {t("settings.locations.delete")}
      </Button>
      {(deletion.payloadError || deletion.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            deletion.payloadError?.__typename === "ConflictError"
              ? "settings.locations.inUse"
              : "settings.locations.failed",
            { name: location.name },
          )}
        </p>
      )}
    </div>
  );
}
