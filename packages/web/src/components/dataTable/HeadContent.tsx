import type { ReactNode } from "react";

type Props = {
  /** Shown before the header's label, such as a checkbox that selects the page. */
  leading: ReactNode;
  children: ReactNode;
};

/** A column header's content, with what comes before its label. */
export function HeadContent({ leading, children }: Props) {
  return leading ? (
    <div className="flex items-center gap-3">
      {leading}
      {children}
    </div>
  ) : (
    children
  );
}
