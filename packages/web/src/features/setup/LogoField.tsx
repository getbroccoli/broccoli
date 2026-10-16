import { Camera, CircleNotch, ImageSquare, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { RemoveCompanyLogoDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import { uploadLogo, type UploadLogoResult } from "@/features/company";

// The API's limit; larger files are refused here without a request.
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const UPLOAD_FAILURES: Record<Exclude<UploadLogoResult, "ok">, MessageKey> = {
  invalidImage: "setup.company.logoInvalid",
  tooLarge: "setup.company.logoInvalid",
  failed: "setup.company.logoFailed",
};

interface LogoFieldProps {
  logoUrl: string | null;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  /** Called after an upload, which goes around Apollo, so the company is read again. */
  onUploaded: () => Promise<unknown>;
}

/** The company logo: saved as soon as the owner chooses or removes it. */
export function LogoField({ logoUrl, disabled, onBusyChange, onUploaded }: LogoFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [removeLogo] = usePayloadMutation(RemoveCompanyLogoDocument);

  const run = async (change: () => Promise<MessageKey | null>) => {
    setFailure(null);
    setBusy(true);
    onBusyChange(true);
    try {
      setFailure(await change());
    } catch {
      // The upload went through but reading the company back failed: the preview is stale.
      setFailure("setup.company.logoFailed");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const upload = (file: File) =>
    run(async () => {
      if (file.size > MAX_LOGO_BYTES) {
        return "setup.company.logoInvalid";
      }
      const result = await uploadLogo(file);
      if (result !== "ok") {
        return UPLOAD_FAILURES[result];
      }
      await onUploaded();
      return null;
    });

  const remove = () =>
    run(async () => {
      try {
        await removeLogo();
        return null;
      } catch {
        return "setup.company.removeFailed";
      }
    });

  const locked = disabled || busy;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <span className="text-sm leading-none font-medium">{t("setup.company.logo")}</span>
      <div className="relative size-24">
        <button
          type="button"
          disabled={locked}
          aria-busy={busy}
          aria-label={t(logoUrl ? "setup.company.changeLogo" : "setup.company.uploadLogo")}
          aria-describedby={failure ? "company-logo-hint company-logo-error" : "company-logo-hint"}
          onClick={() => fileInput.current?.click()}
          className="group/logo relative flex size-full items-center justify-center overflow-hidden rounded-[28%] bg-muted/40 ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        >
          {logoUrl ? (
            <>
              <img
                src={logoUrl}
                alt={t("setup.company.logo")}
                className={cn("size-full bg-card object-contain", busy && "opacity-50")}
              />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-foreground/60 text-xs font-medium text-background opacity-0 transition-opacity group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100 group-disabled/logo:opacity-0">
                <Camera size={20} aria-hidden />
                {t("setup.company.change")}
              </span>
            </>
          ) : (
            <ImageSquare
              size={28}
              aria-hidden
              className={cn("text-muted-foreground", busy && "opacity-50")}
            />
          )}
          {busy && (
            <CircleNotch
              size={24}
              aria-hidden
              className="absolute text-foreground motion-safe:animate-spin"
            />
          )}
        </button>
        {logoUrl && (
          <button
            type="button"
            disabled={locked}
            aria-label={t("setup.company.removeLogo")}
            onClick={() => void remove()}
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <X size={12} weight="bold" aria-hidden />
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file again still triggers a change.
            event.target.value = "";
            if (file) {
              void upload(file);
            }
          }}
        />
      </div>
      <p id="company-logo-hint" className="max-w-40 text-xs text-muted-foreground">
        {t("setup.company.logoHint")}
      </p>
      {failure && (
        <p id="company-logo-error" role="alert" className="max-w-40 text-xs text-destructive">
          {t(failure)}
        </p>
      )}
    </div>
  );
}
