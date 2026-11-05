import { createFileRoute, redirect } from "@tanstack/react-router";

/** Settings opens on its first section. */
export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/email", replace: true });
  },
});
