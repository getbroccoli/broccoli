import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

const DEBOUNCE_MS = 300;

interface EmployeeSearchFieldProps {
  query: string | undefined;
  onQueryChange: (query: string | undefined) => void;
}

/** Search text that reaches the URL once typing pauses, and follows the URL when it changes. */
export function EmployeeSearchField({ query = "", onQueryChange }: EmployeeSearchFieldProps) {
  const [text, setText] = useState(query);
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    setText(query);
  }

  useEffect(() => {
    const typed = text.trim();
    if (typed === query) return;
    const timer = setTimeout(() => onQueryChange(typed || undefined), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query, onQueryChange]);

  return (
    <div className="relative w-56">
      <MagnifyingGlass
        size={13}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("people.search.placeholder")}
        aria-label={t("people.search.label")}
        className="h-7 pl-7 text-[12.5px] md:text-[12.5px]"
      />
    </div>
  );
}
