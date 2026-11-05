type Props = {
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** Gives the figure more weight, such as the days remaining. */
  emphasis?: boolean;
};

/** One labelled figure of an allowance, inside its `dl`. */
export function TimeOffFigure({ label, value, emphasis = false }: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "text-lg font-semibold" : "text-lg"}>{value}</dd>
    </div>
  );
}
