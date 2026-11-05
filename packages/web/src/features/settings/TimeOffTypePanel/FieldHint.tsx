import type { ReactNode } from "react";

type Props = { children: ReactNode };

/** A quiet line under a field saying what it does. */
export function FieldHint({ children }: Props) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
