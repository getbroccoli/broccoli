import { useState } from "react";

import { initialsOf } from "@/lib/initials";

type Props = {
  /** Null shows the initials, as does a photo that fails to load. */
  url: string | null;
  firstName: string;
  lastName: string;
};

/** A person's photo in a small circle, or their initials without one. */
export function Avatar({ url, firstName, lastName }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailedUrl(url)}
        className="size-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
    >
      {initialsOf(firstName, lastName) || "?"}
    </span>
  );
}
