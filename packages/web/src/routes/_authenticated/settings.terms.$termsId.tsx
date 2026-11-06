import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { TermsStack } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/terms/$termsId")({
  component: function TermsStackPage() {
    const { termsId } = Route.useParams();
    const navigate = useNavigate();
    return (
      <TermsStack termsId={termsId} onClose={() => void navigate({ to: "/settings/terms" })} />
    );
  },
});
