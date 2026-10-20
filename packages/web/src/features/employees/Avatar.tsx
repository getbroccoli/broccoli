import { useState } from "react";

import { cn } from "@/lib/class-names";
import { initialsOf } from "@/lib/initials";

type Props = {
  /** Null shows the initials, as does a photo that fails to load. */
  url: string | null;
  firstName: string;
  lastName: string;
  /** Overrides the size and adds to the look, such as a larger avatar with a ring. */
  className?: string;
};

/** A person's photo in a small circle, or their initials without one. */
export function Avatar({ url, firstName, lastName, className }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailedUrl(url)}
        className={cn("size-8 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white",
        className,
      )}
    >
      {initialsOf(firstName, lastName) || "?"}
    </span>
  );
}
