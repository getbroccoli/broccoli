import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { AuthCard } from "./AuthCard";
import { isGraphqlCodegenError } from "./isGraphqlCodegenError";

/** Route failures keep sign-in state intact; development codegen failures explain how to recover. */
export function UnreachablePage({ error }: ErrorComponentProps) {
  const router = useRouter();
  const staleGraphql = import.meta.env.DEV && isGraphqlCodegenError(error);
  return (
    <AuthCard
      title={t(staleGraphql ? "app.codegen.title" : "app.unreachable.title")}
      description={t(staleGraphql ? "app.codegen.detail" : "app.unreachable.detail")}
    >
      <Button
        variant="outline"
        onClick={() => {
          // Reload clears the browser's failed module import after codegen repairs it.
          if (staleGraphql) {
            window.location.reload();
          } else {
            void router.invalidate();
          }
        }}
      >
        {t(staleGraphql ? "app.codegen.reload" : "app.unreachable.retry")}
      </Button>
    </AuthCard>
  );
}
