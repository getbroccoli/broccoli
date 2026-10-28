import { createFileRoute, redirect } from "@tanstack/react-router";

/** Your profile: your own person panel; People for a user without one, such as the owner. */
export const Route = createFileRoute("/_authenticated/me")({
  beforeLoad: ({ context: { me } }) => {
    throw me.employee
      ? redirect({
          to: "/people/$employeeId",
          params: { employeeId: me.employee.id },
          replace: true,
        })
      : redirect({ to: "/people", replace: true });
  },
});
