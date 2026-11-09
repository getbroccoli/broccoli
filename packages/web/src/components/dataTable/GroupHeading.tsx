import { TableHead, TableRow } from "@/components/ui/table";

type Props = { label: string; columnCount: number };

/** The heading row that opens a group of rows. */
export function GroupHeading({ label, columnCount }: Props) {
  return (
    <TableRow className="bg-muted/50 hover:bg-muted/50">
      <TableHead
        scope="colgroup"
        colSpan={columnCount}
        className="h-8 px-3 text-xs font-medium text-foreground"
      >
        {label}
      </TableHead>
    </TableRow>
  );
}
