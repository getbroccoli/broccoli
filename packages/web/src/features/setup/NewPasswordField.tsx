import { Check, Copy, DiceFive } from "@phosphor-icons/react";
import { useState, type Ref } from "react";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

import { generatePassword } from "./generate-password";

interface NewPasswordFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error: string | undefined;
  /** While true the password cannot be typed or generated; it can still be shown and copied. */
  readOnly: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

/** A field for choosing a password, with a generator, show and hide, and copy. */
export function NewPasswordField({
  id,
  value,
  onChange,
  onBlur,
  error,
  readOnly,
  inputRef,
}: NewPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { copied, copyFailed, copy, resetCopy } = useCopyToClipboard();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const copyErrorId = `${id}-copy-error`;
  const showGenerated = generated && value !== "";

  function changePassword(password: string, isGenerated: boolean) {
    onChange(password);
    setGenerated(isGenerated);
    resetCopy();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{t("setup.owner.password")}</Label>
        <Button
          type="button"
          variant="ghost"
          className="-mr-2"
          disabled={readOnly}
          aria-label={t(
            showGenerated ? "setup.owner.generateAnotherLabel" : "setup.owner.generateLabel",
          )}
          onClick={() => {
            changePassword(generatePassword(), true);
            setVisible(true);
          }}
        >
          <DiceFive aria-hidden />
          {t(showGenerated ? "setup.owner.generateAnother" : "setup.owner.generate")}
        </Button>
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={readOnly}
          placeholder={t("setup.owner.passwordPlaceholder")}
          className="h-12 rounded-xl bg-muted/30 pr-40 pl-4"
          value={value}
          onChange={(event) => changePassword(event.target.value, false)}
          onBlur={onBlur}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(hintId, error && errorId, copyFailed && copyErrorId)}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            aria-label={t(visible ? "setup.owner.hideLabel" : "setup.owner.showLabel")}
            onClick={() => setVisible(!visible)}
          >
            {t(visible ? "setup.owner.hide" : "setup.owner.show")}
          </Button>
          {value && (
            <Button type="button" variant="outline" onClick={() => void copy(value)}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span aria-live="polite">
                {t(copied ? "setup.owner.copied" : "setup.owner.copy")}
              </span>
            </Button>
          )}
        </div>
      </div>
      <p id={hintId} aria-live="polite" className="text-sm text-muted-foreground">
        {t(showGenerated ? "setup.owner.passwordSaveHint" : "setup.owner.passwordHint")}
      </p>
      <FieldError id={errorId} message={error} />
      {copyFailed && (
        <p id={copyErrorId} role="alert" className="text-sm text-destructive">
          {t("setup.owner.copyFailed")}
        </p>
      )}
    </div>
  );
}

function describedBy(...ids: (string | false | undefined)[]): string {
  return ids.filter(Boolean).join(" ");
}
