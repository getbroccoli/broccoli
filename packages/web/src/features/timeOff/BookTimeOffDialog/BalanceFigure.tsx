type Props = { value: number; label: string };

/** One big figure with its label, such as "20 free now". */
export function BalanceFigure({ value, label }: Props) {
  return (
    <span className="flex flex-col">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
    </span>
  );
}
