import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { LocationStack } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/locations/$locationId")({
  component: function LocationStackPage() {
    const { locationId } = Route.useParams();
    const navigate = useNavigate();
    return (
      <LocationStack
        locationId={locationId}
        onClose={() => void navigate({ to: "/settings/locations" })}
      />
    );
  },
});
