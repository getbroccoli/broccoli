/** The name with an initials avatar. */
export function EmployeeNameCell({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
      >
        {initialsOf(firstName, lastName)}
      </span>
      <span className="truncate font-medium text-foreground">{`${firstName} ${lastName}`}</span>
    </div>
  );
}

function initialsOf(firstName: string, lastName: string): string {
  // By code point, so a name starting with an emoji or astral letter keeps it whole.
  const [first = ""] = firstName;
  const [last = ""] = lastName;
  return `${first}${last}`.toUpperCase();
}
