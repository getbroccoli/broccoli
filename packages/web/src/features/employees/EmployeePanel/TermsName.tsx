import { Link } from "@tanstack/react-router";

type Props = {
  period: { termsId: string; termsName: string };
  linksToSettings: boolean;
};

/** A terms' name: a link to its settings for admins, plain text for everyone else. */
export function TermsName({ period, linksToSettings }: Props) {
  return linksToSettings ? (
    <Link
      to="/settings/terms/$termsId"
      params={{ termsId: period.termsId }}
      className="font-semibold underline decoration-border underline-offset-3"
    >
      {period.termsName}
    </Link>
  ) : (
    <span className="font-semibold">{period.termsName}</span>
  );
}
