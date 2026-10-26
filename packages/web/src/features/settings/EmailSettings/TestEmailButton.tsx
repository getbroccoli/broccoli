import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";

import { SendTestEmailDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Sends the owner a test email with the saved settings; a refusal shows the provider's reason. */
export function TestEmailButton({ disabled }: { disabled: boolean }) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const [sendTestEmail, { loading, error, payloadError }] =
    usePayloadMutation(SendTestEmailDocument);

  const send = async () => {
    try {
      await sendTestEmail();
      toast.success(t("settings.email.testSent", { email: me.email }));
    } catch {
      // `usePayloadMutation` keeps the failure for display.
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || loading}
        onClick={() => void send()}
      >
        {loading ? t("settings.email.sendingTest") : t("settings.email.sendTest")}
      </Button>
      {(error || payloadError) && (
        <p role="alert" className="text-sm text-destructive">
          {payloadError?.__typename === "UnavailableError"
            ? t("settings.email.testRefused", { reason: payloadError.message })
            : t("settings.email.testFailed")}
        </p>
      )}
    </div>
  );
}
