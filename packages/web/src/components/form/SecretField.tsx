import { Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FieldError } from "./FieldError";

type Props = {
  id: string;
  label: string;
  /** What is typed; null while the saved secret is kept. */
  value: string | null;
  onChange: (secret: string) => void;
  /** Hides what is typed, as for an API key. */
  masked: boolean;
  /** Says the saved secret is kept, such as "Key saved". */
  savedLabel: string;
  replaceLabel: string;
  error: string | undefined;
  hint?: ReactNode;
  placeholder?: string;
};

/** A key or URL that is never shown once saved: the saved one stays until Replace starts typing. */
export function SecretField({
  id,
  label,
  value,
  onChange,
  masked,
  savedLabel,
  replaceLabel,
  error,
  hint,
  placeholder,
}: Props) {
  if (value === null) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-brand-deep">
            <Check size={14} weight="bold" aria-hidden />
            {savedLabel}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>
            {replaceLabel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={masked ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        placeholder={placeholder}
        className="h-10 rounded-lg"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
