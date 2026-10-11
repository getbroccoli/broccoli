import { Plant } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { t } from "@/i18n";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * The frame of pages outside the app shell, such as sign-in: one card centred on the
 * backdrop, with the Broccoli mark on top. It also sets the document title.
 */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main className="surface-grain flex min-h-dvh items-center justify-center bg-app-backdrop p-6">
      <title>{`${title} · ${t("app.name")}`}</title>
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-[0_30px_70px_-28px_rgba(33,30,23,0.5)] ring-1 ring-foreground/10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Plant size={15} weight="fill" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-2 text-sm text-foreground/70">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
