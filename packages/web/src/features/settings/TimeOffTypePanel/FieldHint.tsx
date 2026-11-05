import type { ReactNode } from "react";

/** A quiet line under a field saying what it does. */
export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
