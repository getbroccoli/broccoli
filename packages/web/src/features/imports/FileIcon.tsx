import { FileCsv, FilePdf, FileXls } from "@phosphor-icons/react";

type Props = { name: string; size: number; className?: string };

/** The mark of a staff file by its extension: PDF, Excel or, otherwise, CSV. */
export function FileIcon({ name, size, className }: Props) {
  const lowerName = name.toLowerCase();
  const Icon = lowerName.endsWith(".pdf")
    ? FilePdf
    : lowerName.endsWith(".xlsx")
      ? FileXls
      : FileCsv;
  return <Icon size={size} weight="duotone" aria-hidden className={className} />;
}
