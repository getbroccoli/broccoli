import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

/** One group of people in the invite dialog, such as those who get an invite. */
export function PeopleList({ title, children }: Props) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-0.5 text-sm">{children}</ul>
    </section>
  );
}
