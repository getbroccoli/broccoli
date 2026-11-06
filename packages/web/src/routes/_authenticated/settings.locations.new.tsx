import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { LocationStack } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/locations/new")({
  component: function NewLocationPage() {
    const navigate = useNavigate();
    return (
      <LocationStack
        locationId={null}
        onClose={() => void navigate({ to: "/settings/locations" })}
      />
    );
  },
});
