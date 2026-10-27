import { useQuery } from "@apollo/client/react";
import { useDeferredValue, useId, useState } from "react";

import { ManagerOptionsDocument } from "@/__generated__/graphql";
import { Input } from "@/components/ui/input";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

/**
 * The manager field's editor: searches people by name or email and picks one, or no manager.
 * The value is the manager's id; "" is no manager.
 */
export function ManagerPicker({
  field,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: FieldEditorProps) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const deferredSearch = useDeferredValue(search.trim().slice(0, SEARCH_MAX_LENGTH));
  const { data, loading } = useQuery(ManagerOptionsDocument, {
    variables: { search: deferredSearch || null },
  });
  const people = data?.employees.edges.map(({ node }) => node) ?? [];
  const options = [
    { id: "", label: t("people.panel.manager.none"), detail: null },
    ...people.map((person) => ({
      id: person.id,
      label: `${person.firstName} ${person.lastName}`,
      detail: person.email,
    })),
  ];
  const activeIndex = Math.min(active, options.length - 1);

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
        aria-activedescendant={`${listId}-${activeIndex}`}
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
        }}
        onBlur={onDone}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + options.length) % options.length);
          }
          if (event.key === "Enter") pick(options[activeIndex]!.id);
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
            aria-selected={index === activeIndex}
            // Before the input's blur, so the pick lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option.id)}
            className={cn(
              "flex cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1",
              index === activeIndex && "bg-muted",
              option.id === "" && "text-muted-foreground",
            )}
          >
            <span className="truncate">{option.label}</span>
            {option.detail && (
              <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
            )}
          </li>
        ))}
        {!loading && people.length === 0 && (
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
