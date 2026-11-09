import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => redirect({ to: "/tasks", replace: true, throw: true }),
});
