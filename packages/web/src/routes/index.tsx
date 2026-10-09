import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => redirect({ to: "/people", replace: true, throw: true }),
});
