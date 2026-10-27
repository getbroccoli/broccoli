import { useQuery } from "@apollo/client/react";
import { useEffect, useId, useState } from "react";

import { ManagerOptionsDocument } from "@/__generated__/graphql";
import { Input } from "@/components/ui/input";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = FieldEditorProps;

/**
 * The manager field's editor: searches people by name or email and picks one, or no manager;
 * the person themselves is left out. The value is the manager's id; "" is no manager.
 */
export function ManagerPicker({
  field,
  recordId,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const typed = search.trim().slice(0, SEARCH_MAX_LENGTH);
  const { data, previousData, loading, error } = useQuery(ManagerOptionsDocument, {
    variables: { search: query || null },
  });
  // Enter picks only from the results of what is typed, never a stale or pending list.
  const settled = query === typed && !loading && Boolean(data);
  const people =
    (data ?? previousData)?.employees.edges
      .map(({ node }) => node)
      .filter(({ id }) => id !== recordId) ?? [];

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const options = [
    { id: "", label: t("people.panel.manager.none"), detail: null },
    ...people.map((person) => ({
      id: person.id,
      label: `${person.firstName} ${person.lastName}`,
      detail: person.email,
    })),
  ];

  const pick = (id: string) => {
    onChange(id);
    onDone();
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        role="combobox"
        value={search}
        autoFocus
        placeholder={t("people.panel.manager.search")}
        aria-label={field.label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setSearch(event.target.value);
          // A search puts the first match ahead of "No manager".
          setActive(event.target.value.trim() ? 1 : 0);
        }}
        onBlur={onDone}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            const from = Math.min(active, options.length - 1);
            setActive((from + step + options.length) % options.length);
          }
          const option = options[active];
          if (event.key === "Enter" && settled && option) pick(option.id);
          if (event.key === "Escape") {
            // Escape reverts this field only; it must not also close the panel.
            event.stopPropagation();
            onRevert();
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label={field.label} className="flex flex-col py-0.5">
        {options.map((option, index) => (
          <li
            key={option.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Before the input's blur, so the pick lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option.id)}
            className={cn(
              "flex cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1",
              index === active && "bg-muted",
              option.id === "" && "text-muted-foreground",
            )}
          >
            <span className="truncate">{option.label}</span>
            {option.detail && (
              <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
            )}
          </li>
        ))}
        {error && (
          <li className="px-1.5 py-1 text-xs text-destructive">
            {t("people.panel.manager.searchFailed")}
          </li>
        )}
        {settled && people.length === 0 && (
          <li className="px-1.5 py-1 text-xs text-muted-foreground">
            {t("people.panel.manager.noMatches")}
          </li>
        )}
      </ul>
    </div>
  );
}

/** The API's longest search. */
const SEARCH_MAX_LENGTH = 100;

/** How long typing pauses before the search runs. */
const DEBOUNCE_MS = 200;
