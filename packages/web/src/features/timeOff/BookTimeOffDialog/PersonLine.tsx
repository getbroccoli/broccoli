import { Avatar } from "@/features/employees";

export type Person = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  avatarUrl?: string | null;
};

type Props = { person: Person };

export function PersonLine({ person }: Props) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        url={person.avatarUrl ?? null}
        firstName={person.firstName}
        lastName={person.lastName}
        className="size-6 text-[9px]"
      />
      <span className="truncate">
        {person.firstName} {person.lastName}
      </span>
      {person.jobTitle && (
        <span className="truncate text-xs text-muted-foreground">· {person.jobTitle}</span>
      )}
    </span>
  );
}
